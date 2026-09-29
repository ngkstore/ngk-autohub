-- ============================================================================
-- FRETE DO TIKTOK SEPARADO (29/09/2026)
-- O TikTok cobra o frete real de cada pedido (actual_shipping_fee) e devolve o
-- subsídio do Programa de Frete Grátis (shipping_fee_discount) + o que o cliente
-- pagou (customer_paid_shipping_fee). Em pedido normal fecha em zero; o custo
-- líquido aparece em devolução (return_shipping_fee), reembolso (o subsídio some
-- e o frete do cliente é estornado) e nos raros casos acima do subsídio.
-- Aqui: coluna pedidos.frete_custo (líquido), linha própria no DRE e RPCs com
-- o detalhe por motivo + lista de pedidos pra contestar.
-- ============================================================================

alter table pedidos add column if not exists frete_custo numeric(14,2);
alter table financas_resumo_diario add column if not exists frete_custo numeric(14,2) not null default 0;

-- ------------------------------------------- aplicar: grava também o frete líquido
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
      sum(t.shipping_cost)                           as frete_custo,
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
    frete_custo           = a.frete_custo,
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

-- ------------------------------------------- DRE: soma o frete líquido por dia
create or replace function rebuild_financas_dre()
returns void language plpgsql security definer as $$
begin
  delete from financas_resumo_diario where true;
  insert into financas_resumo_diario
    (loja_id, dia, uf, total_pedidos, receita_bruta, taxas, cupom_proprio, qtd_cupom,
     afiliado, qtd_afiliado, receita_liquida, taxa_servico_afiliado, cmv, unidades,
     itens_total, itens_com_custo, a_receber, qtd_a_receber, frete_custo)
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
    count(*) filter (where p.recebido_em is null and coalesce(p.data_pagamento,p.data_pedido) >= now() - interval '45 days')::int,
    coalesce(sum(p.frete_custo),0)
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

-- ------------------------------------------- resumo_financas devolve frete_custo
create or replace function resumo_financas(p_loja_ids uuid[] default null, p_inicio timestamptz default null, p_fim timestamptz default null, p_conta uuid default null)
returns json language sql stable as $$
  with di as (select (p_inicio at time zone 'America/Sao_Paulo')::date as ini, (p_fim at time zone 'America/Sao_Paulo')::date as fim),
  comp as (
    select coalesce(sum(receita_bruta),0) as receita_bruta, coalesce(sum(taxas),0) as taxas,
      coalesce(sum(cupom_proprio),0) as cupom_proprio, coalesce(sum(qtd_cupom),0) as qtd_cupom,
      coalesce(sum(afiliado),0) as afiliado, coalesce(sum(qtd_afiliado),0) as qtd_afiliado,
      coalesce(sum(taxa_servico_afiliado),0) as taxa_servico_afiliado,
      coalesce(sum(receita_liquida),0) as receita_liquida, coalesce(sum(total_pedidos),0) as total_pedidos,
      coalesce(sum(a_receber),0) as a_receber, coalesce(sum(qtd_a_receber),0) as qtd_a_receber,
      coalesce(sum(frete_custo),0) as frete_custo
    from financas_resumo_diario f, di
    where (p_loja_ids is null or f.loja_id = any(p_loja_ids))
      and (p_inicio is null or f.dia >= di.ini) and (p_fim is null or f.dia < di.fim)
  ),
  cash as (
    select coalesce(sum(recebido),0) as recebido, coalesce(sum(qtd_recebido),0) as qtd_recebido
    from financas_recebido_diario r, di
    where (p_loja_ids is null or r.loja_id = any(p_loja_ids))
      and (p_inicio is null or r.dia >= di.ini) and (p_fim is null or r.dia < di.fim)
  ),
  cart as (
    select coalesce(-sum(valor) filter (where categoria='ads'),0) as ads,
           coalesce(-sum(valor) filter (where categoria='reembolso'),0) as reembolsos
    from carteira_transacoes
    where (p_loja_ids is null or loja_id = any(p_loja_ids))
      and (p_inicio is null or criado_em >= p_inicio) and (p_fim is null or criado_em < p_fim)
  ),
  imp as (
    select coalesce(sum(valor),0) as imposto from impostos
    where p_conta is not null and conta_id = p_conta
      and (p_inicio is null or (competencia||'-01')::timestamptz >= date_trunc('month', p_inicio))
      and (p_fim is null or (competencia||'-01')::timestamptz < p_fim)
  ),
  -- créditos que o TikTok paga fora do pedido (reembolso de logística/plataforma), pela data do extrato
  tk as (
    select coalesce(sum(t.settlement),0) as reembolsos_tiktok
    from tiktok_transacoes t join tiktok_extratos e on e.id = t.statement_id
    where t.tipo <> 'ORDER'
      and (p_loja_ids is null or t.loja_id = any(p_loja_ids))
      and (p_inicio is null or e.statement_time >= p_inicio) and (p_fim is null or e.statement_time < p_fim)
  ),
  uf as (
    select coalesce(json_agg(json_build_object('uf', u, 'pedidos', q, 'valor', v) order by v desc), '[]'::json) as j
    from (select f.uf as u, sum(f.total_pedidos)::int as q, coalesce(sum(f.receita_bruta),0) as v
          from financas_resumo_diario f, di
          where (p_loja_ids is null or f.loja_id = any(p_loja_ids))
            and (p_inicio is null or f.dia >= di.ini) and (p_fim is null or f.dia < di.fim)
          group by f.uf) t
  )
  select json_build_object(
    'receita_bruta',comp.receita_bruta,'taxas',comp.taxas,'cupom_proprio',comp.cupom_proprio,'qtd_cupom',comp.qtd_cupom,
    'afiliado',comp.afiliado,'qtd_afiliado',comp.qtd_afiliado,'taxa_servico_afiliado',comp.taxa_servico_afiliado,
    'receita_liquida',comp.receita_liquida,'total_pedidos',comp.total_pedidos,
    'recebido',cash.recebido,'qtd_recebido',cash.qtd_recebido,'a_receber',comp.a_receber,'qtd_a_receber',comp.qtd_a_receber,
    'ads',cart.ads,'reembolsos',cart.reembolsos,'imposto',imp.imposto,'por_uf',uf.j,
    'frete_custo',comp.frete_custo,'reembolsos_tiktok',tk.reembolsos_tiktok
  ) from comp,cash,cart,imp,uf,tk;
$$;
grant execute on function resumo_financas(uuid[], timestamptz, timestamptz, uuid) to anon, authenticated;

-- ------------------------------------------- frete TikTok por motivo (resumo + lista)
-- Por pedido: frete_real (cobrado), subsídio do Frete Grátis, pago pelo cliente,
-- devolução, frete do cliente estornado e o líquido. Motivo:
--   devolucao       = return_shipping_fee > 0 (você pagou o frete de volta)
--   reembolso       = pedido reembolsado/cancelado (sem receita ou frete do cliente estornado)
--   acima_subsidio  = pedido normal em que o frete real passou do subsídio + frete do cliente
--   credito         = sobrou a seu favor
create or replace function tiktok_frete_por_pedido(p_loja_ids uuid[] default null, p_inicio timestamptz default null, p_fim timestamptz default null)
returns table(loja_id uuid, order_id text, revenue numeric, frete_real numeric, subsidio numeric, pago_cliente numeric,
              devolucao numeric, estorno_cliente numeric, liquido numeric, motivo text)
language sql stable as $$
  with o as (
    select t.loja_id, t.order_id,
      sum(t.revenue) as revenue,
      sum(t.shipping_cost) as liquido,
      sum(-coalesce(nullif(t.breakdown->'shipping_cost_breakdown'->>'actual_shipping_fee_amount','')::numeric,0)) as frete_real,
      sum( coalesce(nullif(t.breakdown->'shipping_cost_breakdown'->>'shipping_fee_discount_amount','')::numeric,0)) as subsidio,
      sum( coalesce(nullif(t.breakdown->'shipping_cost_breakdown'->>'customer_paid_shipping_fee_amount','')::numeric,0)) as pago_cliente,
      sum(-coalesce(nullif(t.breakdown->'shipping_cost_breakdown'->>'return_shipping_fee_amount','')::numeric,0)) as devolucao,
      sum(-coalesce(nullif(t.breakdown->'shipping_cost_breakdown'->'supplementary_component'->>'refunded_customer_shipping_fee_amount','')::numeric,0)) as estorno_cliente
    from tiktok_transacoes t
    where t.tipo = 'ORDER' and t.order_id is not null
      and (p_loja_ids is null or t.loja_id = any(p_loja_ids))
      and (p_inicio is null or t.order_create_time >= p_inicio)
      and (p_fim is null or t.order_create_time < p_fim)
    group by 1,2
  )
  select loja_id, order_id, round(revenue,2), round(frete_real,2), round(subsidio,2), round(pago_cliente,2),
         round(devolucao,2), round(estorno_cliente,2), round(liquido,2),
         case when devolucao > 0 then 'devolucao'
              when revenue <= 0 or estorno_cliente > 0 then 'reembolso'
              when liquido > 0.005 then 'acima_subsidio'
              when liquido < -0.005 then 'credito'
              else 'zerado' end
  from o;
$$;
grant execute on function tiktok_frete_por_pedido(uuid[], timestamptz, timestamptz) to anon, authenticated;

create or replace function tiktok_frete_resumo(p_loja_ids uuid[] default null, p_inicio timestamptz default null, p_fim timestamptz default null)
returns json language sql stable as $$
  with f as (select * from tiktok_frete_por_pedido(p_loja_ids, p_inicio, p_fim))
  select json_build_object(
    'pedidos', count(*),
    'frete_real', coalesce(sum(frete_real),0),
    'subsidio', coalesce(sum(subsidio),0),
    'pago_cliente', coalesce(sum(pago_cliente),0),
    'liquido', coalesce(sum(liquido),0),
    'custo', coalesce(sum(liquido) filter (where liquido > 0),0),
    'credito', coalesce(-sum(liquido) filter (where liquido < 0),0),
    'por_motivo', (select coalesce(json_agg(json_build_object('motivo', motivo, 'pedidos', q, 'valor', v) order by v desc), '[]'::json)
                   from (select motivo, count(*) as q, sum(liquido) as v from f where motivo <> 'zerado' group by motivo) m)
  ) from f;
$$;
grant execute on function tiktok_frete_resumo(uuid[], timestamptz, timestamptz) to anon, authenticated;

create or replace function tiktok_frete_lista(p_loja_ids uuid[] default null, p_inicio timestamptz default null, p_fim timestamptz default null, p_limite int default 100, p_offset int default 0)
returns table(order_id text, cliente_nome text, data_pedido timestamptz, status text, revenue numeric, frete_real numeric, subsidio numeric,
              pago_cliente numeric, devolucao numeric, estorno_cliente numeric, liquido numeric, motivo text)
language sql stable as $$
  select f.order_id, p.cliente_nome, p.data_pedido, p.status, f.revenue, f.frete_real, f.subsidio, f.pago_cliente,
         f.devolucao, f.estorno_cliente, f.liquido, f.motivo
  from tiktok_frete_por_pedido(p_loja_ids, p_inicio, p_fim) f
  left join pedidos p on p.loja_id = f.loja_id and p.marketplace = 'tiktok_shop' and p.pedido_externo_id = f.order_id
  where f.liquido > 0.005
  order by f.liquido desc, f.order_id
  offset p_offset limit p_limite;
$$;
grant execute on function tiktok_frete_lista(uuid[], timestamptz, timestamptz, int, int) to anon, authenticated;

-- backfill do frete_custo nos pedidos já aplicados
select tiktok_reaplicar_pedidos(l.id) from lojas l where l.marketplace = 'tiktok_shop';
