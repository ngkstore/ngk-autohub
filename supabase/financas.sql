-- ============================================================================
-- HUB FINANÇAS — base de dados
-- Rode UMA vez no Supabase -> SQL Editor -> Run (seguro rodar de novo).
-- ============================================================================

-- 1) Extrato da carteira Shopee (get_wallet_transaction_list).
--    Cada movimento: renda de pedido, Ads, antecipação, reembolso, saque…
create table if not exists carteira_transacoes (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid references lojas(id),
  transaction_id text not null,              -- id da transação na Shopee (único p/ loja)
  tipo text,                                 -- ESCROW_VERIFIED_ADD, SPM_DEDUCT, FAST_ESCROW_DEDUCT...
  categoria text,                            -- renda | ads | antecipacao | reembolso | saque | outro
  order_sn text,                             -- pedido relacionado (quando houver)
  valor numeric(14,2),                       -- + entra, - sai
  saldo numeric(14,2),                       -- saldo da carteira após o movimento
  money_flow text,                           -- MONEY_IN | MONEY_OUT
  descricao text,
  criado_em timestamptz,                     -- create_time da Shopee (BRT)
  importado_em timestamptz default now(),
  unique (loja_id, transaction_id)
);
create index if not exists carteira_loja_idx on carteira_transacoes (loja_id);
create index if not exists carteira_order_idx on carteira_transacoes (order_sn);
create index if not exists carteira_criado_idx on carteira_transacoes (criado_em);

-- 2) Campos novos no pedido: quando o dinheiro caiu, e a região de destino.
alter table pedidos add column if not exists recebido_em timestamptz;   -- caiu na carteira
alter table pedidos add column if not exists valor_recebido numeric(14,2); -- somado da carteira
alter table pedidos add column if not exists uf text;                   -- estado destino (do sort_code)
alter table pedidos add column if not exists hub_regiao text;           -- hub/sub-região (do sort_code)
alter table pedidos add column if not exists enviado_em timestamptz;    -- rastreio: postado
alter table pedidos add column if not exists entregue_em timestamptz;   -- rastreio: entregue
alter table pedidos add column if not exists regiao_atualizada_em timestamptz;

-- 2b) Comissão do Programa de Afiliados (custo VARIÁVEL, igual Ads — não é
--     taxa obrigatória). Vem do escrow em order_ams_commission_fee.
alter table pedidos add column if not exists comissao_afiliado numeric(14,2);

-- 3) Custo do produto (editável na tela). Custo TOTAL por unidade.
alter table produtos add column if not exists custo numeric(14,2);

-- 4) Impostos lançados (o que foi de fato pago, por mês, por conta).
create table if not exists impostos (
  id uuid primary key default gen_random_uuid(),
  conta_id uuid references contas(id),
  competencia text not null,                 -- 'YYYY-MM'
  valor numeric(14,2) not null default 0,
  criado_em timestamptz default now(),
  unique (conta_id, competencia)
);

-- ============================================================================
-- 5) RPC: resumo do Balanço/DRE por período e loja(s).
--    Usa o escrow do pedido (já sincronizado) + carteira + impostos.
--    OBS: cupom da Shopee NÃO entra — só cupom_loja (próprio).
-- ============================================================================
drop function if exists resumo_financas(uuid[], timestamptz, timestamptz, uuid);
create or replace function resumo_financas(
  p_loja_ids uuid[] default null,
  p_inicio timestamptz default null,
  p_fim timestamptz default null,
  p_conta uuid default null
)
returns json
language sql
stable
as $$
  with base as (
    select *
    from pedidos
    where marketplace = 'shopee'
      and (p_loja_ids is null or loja_id = any(p_loja_ids))
      and (p_inicio is null or coalesce(data_pagamento, data_pedido) >= p_inicio)
      and (p_fim is null or coalesce(data_pagamento, data_pedido) < p_fim)
  ),
  efet as (select * from base where pedido_efetivado)
  select json_build_object(
    'receita_bruta',   (select coalesce(sum(valor_total),0) from efet),
    'taxas',           (select coalesce(sum(coalesce(taxa_comissao,0)+coalesce(taxa_servico,0)),0) from efet),
    'cupom_proprio',   (select coalesce(sum(cupom_loja),0) from efet),
    'qtd_cupom',       (select count(*) from efet where coalesce(cupom_loja,0) > 0),
    'afiliado',        (select coalesce(sum(comissao_afiliado),0) from efet),
    'qtd_afiliado',    (select count(*) from efet where coalesce(comissao_afiliado,0) > 0),
    'receita_liquida', (select coalesce(sum(valor_liquido),0) from efet where escrow_atualizado_em is not null),
    -- Recebido = dinheiro que CAIU no período (filtra por recebido_em, não pela data do pedido).
    'recebido',        (select coalesce(sum(valor_recebido),0) from pedidos
                          where marketplace='shopee' and recebido_em is not null
                            and (p_loja_ids is null or loja_id = any(p_loja_ids))
                            and (p_inicio is null or recebido_em >= p_inicio)
                            and (p_fim is null or recebido_em < p_fim)),
    'qtd_recebido',    (select count(*) from pedidos
                          where marketplace='shopee' and recebido_em is not null
                            and (p_loja_ids is null or loja_id = any(p_loja_ids))
                            and (p_inicio is null or recebido_em >= p_inicio)
                            and (p_fim is null or recebido_em < p_fim)),
    -- A receber = pendências RECENTES (últimos 90 dias), independente do filtro de período
    -- (evita inflar com pedidos antigos cuja renda ainda não foi sincronizada).
    'a_receber',       (select coalesce(sum(coalesce(valor_liquido, valor_total)),0) from pedidos
                          where marketplace='shopee' and pedido_efetivado and recebido_em is null
                            and (p_loja_ids is null or loja_id = any(p_loja_ids))
                            and data_pedido >= now() - interval '90 days'),
    'qtd_a_receber',   (select count(*) from pedidos
                          where marketplace='shopee' and pedido_efetivado and recebido_em is null
                            and (p_loja_ids is null or loja_id = any(p_loja_ids))
                            and data_pedido >= now() - interval '90 days'),
    'ads',             (select coalesce(-sum(valor),0) from carteira_transacoes c
                          where c.categoria = 'ads'
                            and (p_loja_ids is null or c.loja_id = any(p_loja_ids))
                            and (p_inicio is null or c.criado_em >= p_inicio)
                            and (p_fim is null or c.criado_em < p_fim)),
    'reembolsos',      (select coalesce(-sum(valor),0) from carteira_transacoes c
                          where c.categoria = 'reembolso'
                            and (p_loja_ids is null or c.loja_id = any(p_loja_ids))
                            and (p_inicio is null or c.criado_em >= p_inicio)
                            and (p_fim is null or c.criado_em < p_fim)),
    'imposto',         (select coalesce(sum(valor),0) from impostos
                          where p_conta is not null and conta_id = p_conta
                            and (p_inicio is null or (competencia || '-01')::timestamptz >= date_trunc('month', p_inicio))
                            and (p_fim is null or (competencia || '-01')::timestamptz < p_fim)),
    'total_pedidos',   (select count(*) from efet),
    'por_uf',          (select coalesce(json_agg(json_build_object('uf', uf, 'pedidos', q, 'valor', v) order by v desc), '[]'::json)
                          from (select coalesce(uf,'—') as uf, count(*)::int as q, coalesce(sum(valor_total),0) as v
                                from efet group by coalesce(uf,'—')) u)
  );
$$;
grant execute on function resumo_financas(uuid[], timestamptz, timestamptz, uuid) to anon, authenticated;

-- 6) Casa a carteira com os pedidos: marca recebido_em / valor_recebido a partir
--    das transações de RENDA (ESCROW_VERIFIED_ADD) por order_sn. Chamada após
--    sincronizar a carteira.
create or replace function casar_carteira_pedidos(p_loja uuid)
returns void
language sql
as $$
  update pedidos p
  set valor_recebido = agg.total,
      recebido_em = agg.quando
  from (
    select order_sn, sum(valor) as total, min(criado_em) as quando
    from carteira_transacoes
    where loja_id = p_loja and categoria = 'renda' and coalesce(order_sn, '') <> ''
    group by order_sn
  ) agg
  where p.loja_id = p_loja and p.pedido_externo_id = agg.order_sn;
$$;
grant execute on function casar_carteira_pedidos(uuid) to anon, authenticated;
