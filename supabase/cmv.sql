-- ============================================================================
-- CMV (Custo da Mercadoria Vendida) — para o lucro líquido REAL no DRE.
-- Soma, no período (competência = data do pedido), qtd_vendida × custo do
-- produto, casando o item_id do item do pedido com produtos.item_id.
-- Também conta itens sem custo cadastrado (pra mostrar o quão completo está).
-- Rode no Supabase -> SQL Editor -> Run (seguro rodar de novo).
-- ============================================================================
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
    select i.qtd, pr.custo
    from itens i
    left join produtos pr
      on pr.loja_id = i.loja_id and pr.item_id = i.item_id_txt
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
