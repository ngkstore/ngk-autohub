-- ============================================================================
-- HUB FINANÇAS — base de dados (v2: otimizada c/ índices, sem timeout)
-- Rode UMA vez no Supabase -> SQL Editor -> Run (seguro rodar de novo).
-- ============================================================================

-- 1) Extrato da carteira Shopee (get_wallet_transaction_list).
create table if not exists carteira_transacoes (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid references lojas(id),
  transaction_id text not null,
  tipo text,
  categoria text,                            -- renda | ads | antecipacao | reembolso | saque | outro
  order_sn text,
  valor numeric(14,2),
  saldo numeric(14,2),
  money_flow text,
  descricao text,
  criado_em timestamptz,
  importado_em timestamptz default now(),
  unique (loja_id, transaction_id)
);
create index if not exists carteira_loja_idx on carteira_transacoes (loja_id);
create index if not exists carteira_order_idx on carteira_transacoes (order_sn);
create index if not exists carteira_criado_idx on carteira_transacoes (criado_em);
create index if not exists carteira_cat_idx on carteira_transacoes (categoria, criado_em);

-- 2) Campos novos no pedido.
alter table pedidos add column if not exists recebido_em timestamptz;
alter table pedidos add column if not exists valor_recebido numeric(14,2);
alter table pedidos add column if not exists uf text;
alter table pedidos add column if not exists hub_regiao text;
alter table pedidos add column if not exists enviado_em timestamptz;
alter table pedidos add column if not exists entregue_em timestamptz;
alter table pedidos add column if not exists regiao_atualizada_em timestamptz;
alter table pedidos add column if not exists comissao_afiliado numeric(14,2);

-- 2c) ÍNDICES de performance (evitam o timeout nas funções de Finanças).
create index if not exists pedidos_recebido_em_idx on pedidos (recebido_em);
create index if not exists pedidos_data_pedido_idx on pedidos (data_pedido);
create index if not exists pedidos_mkt_efet_idx on pedidos (marketplace, pedido_efetivado);
create index if not exists pedidos_regiao_pend_idx on pedidos (regiao_atualizada_em);

-- 3) Custo do produto (editável na tela).
alter table produtos add column if not exists custo numeric(14,2);

-- 4) Impostos lançados (por mês, por conta).
create table if not exists impostos (
  id uuid primary key default gen_random_uuid(),
  conta_id uuid references contas(id),
  competencia text not null,
  valor numeric(14,2) not null default 0,
  criado_em timestamptz default now(),
  unique (conta_id, competencia)
);

-- ============================================================================
-- 5) RPC resumo do Balanço/DRE — OTIMIZADA (poucas varreduras).
--    Receita/taxas/cupom/afiliado = competência (data do pedido).
--    Recebido = caixa que caiu no período (recebido_em). A receber = pendências
--    recentes (90d). Cupom da Shopee NÃO entra (só cupom_loja).
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
    select loja_id, valor_total, valor_liquido, taxa_comissao, taxa_servico,
           cupom_loja, comissao_afiliado, escrow_atualizado_em, uf
    from pedidos
    where marketplace = 'shopee' and pedido_efetivado
      and (p_loja_ids is null or loja_id = any(p_loja_ids))
      and (p_inicio is null or coalesce(data_pagamento, data_pedido) >= p_inicio)
      and (p_fim is null or coalesce(data_pagamento, data_pedido) < p_fim)
  ),
  comp as (
    select
      coalesce(sum(valor_total), 0) as receita_bruta,
      coalesce(sum(coalesce(taxa_comissao,0)+coalesce(taxa_servico,0)), 0) as taxas,
      coalesce(sum(cupom_loja), 0) as cupom_proprio,
      count(*) filter (where coalesce(cupom_loja,0) > 0) as qtd_cupom,
      coalesce(sum(comissao_afiliado), 0) as afiliado,
      count(*) filter (where coalesce(comissao_afiliado,0) > 0) as qtd_afiliado,
      coalesce(sum(valor_liquido) filter (where escrow_atualizado_em is not null), 0) as receita_liquida,
      count(*) as total_pedidos
    from base
  ),
  cash_in as (
    select coalesce(sum(valor_recebido), 0) as recebido, count(*) as qtd_recebido
    from pedidos
    where marketplace = 'shopee' and recebido_em is not null
      and (p_loja_ids is null or loja_id = any(p_loja_ids))
      and (p_inicio is null or recebido_em >= p_inicio)
      and (p_fim is null or recebido_em < p_fim)
  ),
  pend as (
    select coalesce(sum(coalesce(valor_liquido, valor_total)), 0) as a_receber, count(*) as qtd_a_receber
    from pedidos
    where marketplace = 'shopee' and pedido_efetivado and recebido_em is null
      and (p_loja_ids is null or loja_id = any(p_loja_ids))
      and data_pedido >= now() - interval '45 days'
  ),
  cart as (
    select
      coalesce(-sum(valor) filter (where categoria = 'ads'), 0) as ads,
      coalesce(-sum(valor) filter (where categoria = 'reembolso'), 0) as reembolsos
    from carteira_transacoes
    where (p_loja_ids is null or loja_id = any(p_loja_ids))
      and (p_inicio is null or criado_em >= p_inicio)
      and (p_fim is null or criado_em < p_fim)
  ),
  imp as (
    select coalesce(sum(valor), 0) as imposto
    from impostos
    where p_conta is not null and conta_id = p_conta
      and (p_inicio is null or (competencia || '-01')::timestamptz >= date_trunc('month', p_inicio))
      and (p_fim is null or (competencia || '-01')::timestamptz < p_fim)
  ),
  uf as (
    select coalesce(json_agg(json_build_object('uf', u, 'pedidos', q, 'valor', v) order by v desc), '[]'::json) as j
    from (select coalesce(uf,'—') as u, count(*)::int as q, coalesce(sum(valor_total),0) as v
          from base group by coalesce(uf,'—')) t
  )
  select json_build_object(
    'receita_bruta', comp.receita_bruta, 'taxas', comp.taxas,
    'cupom_proprio', comp.cupom_proprio, 'qtd_cupom', comp.qtd_cupom,
    'afiliado', comp.afiliado, 'qtd_afiliado', comp.qtd_afiliado,
    'receita_liquida', comp.receita_liquida, 'total_pedidos', comp.total_pedidos,
    'recebido', cash_in.recebido, 'qtd_recebido', cash_in.qtd_recebido,
    'a_receber', pend.a_receber, 'qtd_a_receber', pend.qtd_a_receber,
    'ads', cart.ads, 'reembolsos', cart.reembolsos, 'imposto', imp.imposto,
    'por_uf', uf.j
  )
  from comp, cash_in, pend, cart, imp, uf;
$$;
grant execute on function resumo_financas(uuid[], timestamptz, timestamptz, uuid) to anon, authenticated;

-- 6) Casa a carteira com os pedidos (recebido_em / valor_recebido por order_sn).
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
