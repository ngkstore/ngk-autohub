-- ============================================================================
-- Ranking de produtos AGREGADO no banco (substitui o N+1 catastrófico do app,
-- que contava os pedidos da loja inteira para CADA produto -> errado e pesado).
-- Soma unidades/receita por item_id a partir do item_list dos pedidos (90 dias),
-- casa com produtos e calcula o lucro com o custo (variação -> item).
-- Rode no Supabase -> SQL Editor -> Run (seguro rodar de novo).
-- ============================================================================
create or replace function gerar_ranking_produtos()
returns void language plpgsql as $$
begin
  delete from ranking_produtos;
  insert into ranking_produtos (loja_id, produto_id, pedidos, faturamento, lucro, atualizado_em)
  select pr.loja_id, pr.id, agg.un::int,
    round(agg.receita, 2),
    round(agg.receita - (agg.un * coalesce(agg.cv_custo, pr.custo, 0)), 2),
    now()
  from (
    select p.loja_id, (it->>'item_id') as item_id,
      sum(coalesce(nullif(it->>'model_quantity_purchased','')::numeric,0)) as un,
      sum(coalesce(nullif(it->>'model_quantity_purchased','')::numeric,0) *
          case when coalesce(nullif(it->>'model_discounted_price','')::numeric,0) > 0
               then nullif(it->>'model_discounted_price','')::numeric
               else nullif(it->>'model_original_price','')::numeric end) as receita,
      avg(cvx.custo) as cv_custo
    from pedidos p
    cross join lateral jsonb_array_elements(
      case jsonb_typeof(p.dados_pedido->'item_list') when 'array' then p.dados_pedido->'item_list' else '[]'::jsonb end) it
    left join custos_variacao cvx on cvx.loja_id = p.loja_id and cvx.model_sku = upper(trim(it->>'model_sku'))
    where p.marketplace = 'shopee' and p.pedido_efetivado
      and coalesce(p.data_pagamento, p.data_pedido) >= now() - interval '90 days'
    group by 1, 2
  ) agg
  join produtos pr on pr.loja_id = agg.loja_id and pr.item_id = agg.item_id;
end $$;
grant execute on function gerar_ranking_produtos() to anon, authenticated;
