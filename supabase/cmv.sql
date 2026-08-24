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

-- Lista as variações vendidas (últimos 90d) por produto, com o custo atual da
-- variação e o custo do item (fallback). Usada no editor "Custo por variação".
create or replace function variacoes_custo(p_loja_ids uuid[] default null)
returns json language sql stable as $$
  with itens as (
    select p.loja_id, (it->>'item_id') as item_id, upper(trim(it->>'model_sku')) as model_sku,
      max(it->>'model_name') as variacao,
      sum(coalesce(nullif(it->>'model_quantity_purchased','')::numeric,0)) as un,
      sum(coalesce(nullif(it->>'model_quantity_purchased','')::numeric,0) *
          case when coalesce(nullif(it->>'model_discounted_price','')::numeric,0)>0
               then nullif(it->>'model_discounted_price','')::numeric
               else nullif(it->>'model_original_price','')::numeric end) as receita
    from pedidos p cross join lateral jsonb_array_elements(
      case jsonb_typeof(p.dados_pedido->'item_list') when 'array' then p.dados_pedido->'item_list' else '[]'::jsonb end) it
    where p.marketplace='shopee' and p.pedido_efetivado
      and (p_loja_ids is null or p.loja_id = any(p_loja_ids))
      and coalesce(p.data_pagamento,p.data_pedido) >= now() - interval '90 days'
      and coalesce(it->>'model_sku','') <> ''
    group by 1,2,3
  )
  select coalesce(json_agg(json_build_object(
    'loja_id', i.loja_id, 'loja', coalesce(l.apelido,l.nome),
    'item_sku', pr.sku, 'item_nome', pr.nome, 'model_sku', i.model_sku,
    'variacao', i.variacao, 'un', i.un::int,
    'preco_med', round((i.receita/nullif(i.un,0))::numeric,2),
    'custo', cv.custo, 'custo_item', pr.custo
  ) order by i.un desc), '[]'::json)
  from itens i
  join produtos pr on pr.loja_id=i.loja_id and pr.item_id=i.item_id
  join lojas l on l.id=i.loja_id
  left join custos_variacao cv on cv.loja_id=i.loja_id and cv.model_sku=i.model_sku;
$$;
grant execute on function variacoes_custo(uuid[]) to anon, authenticated;
