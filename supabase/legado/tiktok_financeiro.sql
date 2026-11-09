-- ============================================================================
-- FINANÇAS TIKTOK (v1, 29/09/2026)
-- Os extratos (statements) e transações da API financeira do TikTok Shop
-- preenchem as MESMAS colunas financeiras do pedido que o escrow da Shopee
-- preenche (valor_liquido, taxa_comissao, taxa_servico, comissao_afiliado,
-- frete, recebido_em...). Com isso o /financas (DRE, recebido, a receber,
-- conciliação de recebimento, previsão) passa a incluir marketplace 'tiktok_shop'.
-- Idempotente: pode rodar de novo.
-- ============================================================================

-- ------------------------------------------------------------ extratos (1/dia)
create table if not exists tiktok_extratos (
  id              text primary key,          -- statement id
  loja_id         uuid not null,
  statement_time  timestamptz not null,
  currency        text,
  revenue         numeric(14,2),
  fee             numeric(14,2),
  shipping_cost   numeric(14,2),
  adjustment      numeric(14,2),
  settlement      numeric(14,2),
  net_sales       numeric(14,2),
  payment_id      text,
  payment_status  text,                      -- PAID | PROCESSING | FAILED ...
  payment_time    timestamptz,
  transacoes      int default 0,
  processado_em   timestamptz,               -- null = ainda não lemos as transações
  atualizado_em   timestamptz default now()
);
create index if not exists tiktok_extratos_loja_time_idx on tiktok_extratos (loja_id, statement_time desc);
create index if not exists tiktok_extratos_pend_idx on tiktok_extratos (statement_time) where processado_em is null;

-- ------------------------------------------------- transações (1 por pedido/ajuste)
-- Sinais: revenue/settlement positivos = a receber; taxas já convertidas em
-- COBRANÇA positiva (o TikTok manda negativas); em reembolso ficam negativas.
create table if not exists tiktok_transacoes (
  id                  text primary key,      -- transaction id
  loja_id             uuid not null,
  statement_id        text not null,
  order_id            text,
  tipo                text,                  -- ORDER | ADJUSTMENT | LOGISTICS_REIMBURSEMENT | ...
  order_create_time   timestamptz,
  revenue             numeric(14,2) default 0,
  fee_tax             numeric(14,2) default 0,   -- total de taxas+impostos (cobrança)
  shipping_cost       numeric(14,2) default 0,   -- custo líquido de frete (positivo = custo)
  adjustment          numeric(14,2) default 0,
  settlement          numeric(14,2) default 0,
  comissao_plataforma numeric(14,2) default 0,   -- platform_commission + fee_per_item_sold
  frete_gratis_taxa   numeric(14,2) default 0,   -- sfp_service_fee (Programa de Frete Grátis)
  afiliado            numeric(14,2) default 0,   -- affiliate_commission (+ partner)
  afiliado_ads        numeric(14,2) default 0,   -- affiliate_ads_commission (Shop Ads)
  outras_taxas        numeric(14,2) default 0,   -- o resto do fee_tax
  desconto_vendedor   numeric(14,2) default 0,
  frete_pago_cliente  numeric(14,2) default 0,
  frete_real          numeric(14,2) default 0,
  breakdown           jsonb,
  criado_em           timestamptz default now()
);
create index if not exists tiktok_transacoes_order_idx on tiktok_transacoes (loja_id, order_id);
create index if not exists tiktok_transacoes_stmt_idx  on tiktok_transacoes (statement_id);

-- ------------------------------------------------ aplica nos pedidos (agregado)
-- Soma TODAS as transações ORDER de cada pedido (venda + reembolso posterior) e
-- grava nas colunas financeiras do pedido. recebido = liquidado em extratos PAID.
create or replace function tiktok_aplicar_pedidos(p_loja uuid, p_order_ids text[])
returns int language plpgsql security definer as $$
declare v_n int;
begin
  with agg as (
    select t.order_id,
      sum(t.settlement)                              as liquido,
      sum(t.comissao_plataforma)                     as comissao,
      sum(t.frete_gratis_taxa + t.outras_taxas)      as servico,
      sum(t.afiliado + t.afiliado_ads)               as afiliado,
      sum(t.desconto_vendedor)                       as desc_vendedor,
      sum(t.frete_pago_cliente)                      as frete_cliente,
      sum(t.frete_real)                              as frete_real,
      sum(t.settlement)  filter (where e.payment_status = 'PAID') as recebido,
      max(e.payment_time) filter (where e.payment_status = 'PAID') as recebido_em
    from tiktok_transacoes t
    join tiktok_extratos e on e.id = t.statement_id
    where t.loja_id = p_loja and t.tipo = 'ORDER' and t.order_id = any(p_order_ids)
    group by t.order_id
  )
  update pedidos p set
    valor_liquido         = a.liquido,
    taxa_comissao         = a.comissao,
    taxa_servico          = a.servico,
    taxa_servico_afiliado = 0,
    comissao_afiliado     = a.afiliado,
    desconto_vendedor     = a.desc_vendedor,
    frete                 = a.frete_cliente,
    frete_real            = a.frete_real,
    valor_recebido        = case when a.recebido_em is not null then a.recebido else p.valor_recebido end,
    recebido_em           = coalesce(a.recebido_em, p.recebido_em),
    escrow_atualizado_em  = now(),
    atualizado_em         = now()
  from agg a
  where p.loja_id = p_loja and p.marketplace = 'tiktok_shop' and p.pedido_externo_id = a.order_id;
  get diagnostics v_n = row_count;
  return v_n;
end $$;
grant execute on function tiktok_aplicar_pedidos(uuid, text[]) to anon, authenticated;

-- ------------------------------------------ valor_total do TikTok = receita do vendedor
-- O sync gravava payment.sub_total, que já vem com o desconto da PLATAFORMA
-- descontado (a TikTok paga esse desconto ao vendedor). Receita = preço original
-- dos itens − desconto do vendedor. Set/2026: R$298k → R$324k.
update pedidos
set valor_total = round(((dados_pedido->'payment'->>'original_total_product_price')::numeric
                        - coalesce((dados_pedido->'payment'->>'seller_discount')::numeric, 0))::numeric, 2),
    atualizado_em = now()
where marketplace = 'tiktok_shop'
  and coalesce(nullif(dados_pedido->'payment'->>'original_total_product_price',''),'0')::numeric > 0
  and abs(coalesce(valor_total,0) - ((dados_pedido->'payment'->>'original_total_product_price')::numeric
        - coalesce((dados_pedido->'payment'->>'seller_discount')::numeric, 0))) > 0.005;

-- ================================= /financas passa a incluir tiktok_shop
-- (mesmas funções de financas_split_dre_cmv.sql / conciliacao_resumo.sql /
--  recebimento_aging.sql, só trocando marketplace='shopee' por in (...)).
create or replace function rebuild_financas_dre()
returns void language plpgsql security definer as $$
begin
  delete from financas_resumo_diario where true;
  insert into financas_resumo_diario
    (loja_id, dia, uf, total_pedidos, receita_bruta, taxas, cupom_proprio, qtd_cupom,
     afiliado, qtd_afiliado, receita_liquida, taxa_servico_afiliado, cmv, unidades,
     itens_total, itens_com_custo, a_receber, qtd_a_receber)
  select p.loja_id,
    (coalesce(p.data_pagamento, p.data_pedido) at time zone 'America/Sao_Paulo')::date,
    coalesce(p.uf, '—'),
    count(*)::int,
    coalesce(sum(p.valor_total),0),
    coalesce(sum(coalesce(p.taxa_comissao,0)+coalesce(p.taxa_servico,0)),0),
    coalesce(sum(p.cupom_loja),0),
    count(*) filter (where coalesce(p.cupom_loja,0) > 0)::int,
    coalesce(sum(p.comissao_afiliado),0),
    count(*) filter (where coalesce(p.comissao_afiliado,0) > 0)::int,
    coalesce(sum(p.valor_liquido) filter (where p.escrow_atualizado_em is not null),0),
    coalesce(sum(p.taxa_servico_afiliado),0),
    0,0,0,0,
    coalesce(sum(coalesce(p.valor_liquido, p.valor_total)) filter (where p.recebido_em is null and coalesce(p.data_pagamento,p.data_pedido) >= now() - interval '45 days'),0),
    count(*) filter (where p.recebido_em is null and coalesce(p.data_pagamento,p.data_pedido) >= now() - interval '45 days')::int
  from pedidos p
  where p.marketplace in ('shopee','tiktok_shop') and p.pedido_efetivado and coalesce(p.data_pagamento,p.data_pedido) is not null
  group by 1,2,3;

  delete from financas_recebido_diario where true;
  insert into financas_recebido_diario
  select loja_id, (recebido_em at time zone 'America/Sao_Paulo')::date, coalesce(sum(valor_recebido),0), count(*)::int
  from pedidos where marketplace in ('shopee','tiktok_shop') and recebido_em is not null group by 1,2;

  delete from previsao_lag where true;
  insert into previsao_lag
  select loja_id, uf, avg(lag), count(*)::int from (
    select loja_id, coalesce(uf,'—') as uf, extract(epoch from (recebido_em - data_pedido))/86400.0 as lag
    from pedidos where marketplace in ('shopee','tiktok_shop') and recebido_em is not null and data_pedido is not null
  ) x where lag between 0 and 90 group by 1,2;
  insert into previsao_lag
  select loja_id, 'GERAL', avg(lag), count(*)::int from (
    select loja_id, extract(epoch from (recebido_em - data_pedido))/86400.0 as lag
    from pedidos where marketplace in ('shopee','tiktok_shop') and recebido_em is not null and data_pedido is not null
  ) x where lag between 0 and 90 group by 1;
end $$;
grant execute on function rebuild_financas_dre() to anon, authenticated;

create or replace function resumo_conciliacao(
  p_loja_ids uuid[] default null,
  p_inicio timestamptz default null,
  p_fim timestamptz default null
)
returns json language sql stable as $$
  with base as (
    select coalesce(valor_liquido, valor_total) as esperado,
           coalesce(valor_recebido, 0) as recebido, recebido_em
    from pedidos
    where marketplace in ('shopee','tiktok_shop') and pedido_efetivado
      and (p_loja_ids is null or loja_id = any(p_loja_ids))
      and (p_inicio is null or data_pedido >= p_inicio)
      and (p_fim is null or data_pedido < p_fim)
  )
  select json_build_object(
    'total', count(*),
    'recebidos', count(*) filter (where recebido_em is not null),
    'a_receber', count(*) filter (where recebido_em is null),
    'divergentes', count(*) filter (where recebido_em is not null and abs(recebido - esperado) > 0.5),
    'diverg_valor', coalesce(sum(abs(recebido - esperado)) filter (where recebido_em is not null and abs(recebido - esperado) > 0.5), 0)
  ) from base;
$$;
grant execute on function resumo_conciliacao(uuid[], timestamptz, timestamptz) to anon, authenticated;

create or replace function divergencias_recebimento(
  p_loja_ids uuid[] default null,
  p_inicio timestamptz default null,
  p_fim timestamptz default null,
  p_limite int default 200,
  p_offset int default 0
)
returns table(pedido_externo_id text, cliente_nome text, uf text, esperado numeric, recebido numeric, dif numeric, data_pedido timestamptz)
language sql stable as $$
  select pedido_externo_id, cliente_nome, uf,
    round(coalesce(valor_liquido, valor_total)::numeric, 2) as esperado,
    round(coalesce(valor_recebido, 0)::numeric, 2) as recebido,
    round((coalesce(valor_recebido, 0) - coalesce(valor_liquido, valor_total))::numeric, 2) as dif,
    data_pedido
  from pedidos
  where marketplace in ('shopee','tiktok_shop') and pedido_efetivado and recebido_em is not null
    and abs(coalesce(valor_recebido, 0) - coalesce(valor_liquido, valor_total)) > 0.5
    and (p_loja_ids is null or loja_id = any(p_loja_ids))
    and (p_inicio is null or data_pedido >= p_inicio)
    and (p_fim is null or data_pedido < p_fim)
  order by abs(coalesce(valor_recebido, 0) - coalesce(valor_liquido, valor_total)) desc, pedido_externo_id
  offset p_offset
  limit p_limite;
$$;
grant execute on function divergencias_recebimento(uuid[], timestamptz, timestamptz, int, int) to anon, authenticated;

-- Aging: "desde quando dá pra casar" = 1ª transação da carteira (Shopee) ou 1º extrato (TikTok).
create or replace function recebimento_aging(p_loja_ids uuid[] default null)
returns json language sql stable as $$
  with cs as (
    select loja_id, min(criado_em) as ini from carteira_transacoes group by loja_id
    union all
    select loja_id, min(statement_time) as ini from tiktok_extratos group by loja_id
  ),
  base as (
    select coalesce(p.valor_liquido, p.valor_total) as esperado,
           extract(epoch from (now() - p.data_pedido)) / 86400.0 as dias
    from pedidos p
    join cs on cs.loja_id = p.loja_id
    where p.marketplace in ('shopee','tiktok_shop') and p.pedido_efetivado and p.origem is null
      and coalesce(p.valor_liquido, 0) > 0 and p.recebido_em is null
      and p.data_pedido is not null and p.data_pedido >= cs.ini
      and (p_loja_ids is null or p.loja_id = any(p_loja_ids))
  )
  select json_build_object(
    'b0_30_qtd',  count(*) filter (where dias < 30),
    'b0_30_val',  coalesce(sum(esperado) filter (where dias < 30), 0),
    'b30_60_qtd', count(*) filter (where dias >= 30 and dias < 60),
    'b30_60_val', coalesce(sum(esperado) filter (where dias >= 30 and dias < 60), 0),
    'b60_qtd',    count(*) filter (where dias >= 60),
    'b60_val',    coalesce(sum(esperado) filter (where dias >= 60), 0)
  ) from base;
$$;
grant execute on function recebimento_aging(uuid[]) to anon, authenticated;
