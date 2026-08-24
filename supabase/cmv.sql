-- ============================================================================
-- CMV (Custo da Mercadoria Vendida) — para o lucro líquido REAL no DRE.
-- Soma, no período (competência = data do pedido), qtd_vendida × custo,
-- usando o custo DA VARIAÇÃO (model_sku) quando existe, e caindo no custo do
-- item (produtos.custo) como fallback. Também conta itens sem custo.
-- Rode no Supabase -> SQL Editor -> Run (seguro rodar de novo).
-- ============================================================================

-- Custo por variação (model_sku). Populado a partir da lista de estoque
-- (SKU da variação -> Custo Médio), por loja.
create table if not exists custos_variacao (
  loja_id uuid references lojas(id),
  model_sku text not null,
  custo numeric(14,2),
  atualizado_em timestamptz default now(),
  unique (loja_id, model_sku)
);
create index if not exists custos_variacao_idx on custos_variacao (loja_id, model_sku);

create or replace function resumo_cmv(
  p_loja_ids uuid[] default null,
  p_inicio timestamptz default null,
  p_fim timestamptz default null
)
returns json
language sql
stable
as $$
  with itens as (
    select
      p.loja_id,
      (it->>'item_id') as item_id_txt,
      upper(trim(it->>'model_sku')) as model_sku,
      greatest(
        coalesce(nullif(it->>'model_quantity_purchased','')::numeric,
                 nullif(it->>'active_qty','')::numeric, 0)
        - coalesce(nullif(it->>'returned_qty','')::numeric, 0)
        - coalesce(nullif(it->>'cancelled_qty','')::numeric, 0),
        0
      ) as qtd
    from pedidos p
    cross join lateral jsonb_array_elements(
      case jsonb_typeof(p.dados_pedido->'item_list')
        when 'array' then p.dados_pedido->'item_list'
        else '[]'::jsonb
      end
    ) it
    where p.marketplace = 'shopee' and p.pedido_efetivado
      and (p_loja_ids is null or p.loja_id = any(p_loja_ids))
      and (p_inicio is null or coalesce(p.data_pagamento, p.data_pedido) >= p_inicio)
      and (p_fim is null or coalesce(p.data_pagamento, p.data_pedido) < p_fim)
  ),
  casado as (
    select i.qtd, coalesce(cv.custo, pr.custo) as custo
    from itens i
    left join custos_variacao cv on cv.loja_id = i.loja_id and cv.model_sku = i.model_sku
    left join produtos pr on pr.loja_id = i.loja_id and pr.item_id = i.item_id_txt
  )
  select json_build_object(
    'cmv',             coalesce(sum(qtd * custo) filter (where custo is not null), 0),
    'unidades',        coalesce(sum(qtd), 0),
    'itens_total',     count(*),
    'itens_com_custo', count(*) filter (where custo is not null),
    'itens_sem_custo', count(*) filter (where custo is null)
  )
  from casado;
$$;
grant execute on function resumo_cmv(uuid[], timestamptz, timestamptz) to anon, authenticated;
