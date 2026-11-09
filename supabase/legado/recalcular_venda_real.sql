-- Recalcula o valor_total dos pedidos JÁ existentes como "venda real":
-- soma de (preço de venda do item x quantidade), usando o item_list que já
-- está salvo em dados_pedido. NÃO chama a Shopee.
--
-- Rode UMA vez no Supabase -> SQL Editor -> Run.
-- Os pedidos novos já são gravados certo pelo código.
--
-- Só afeta pedidos que têm item_list salvo (os já enriquecidos).

with calc as (
  select
    p.id,
    sum(
      (it->>'model_discounted_price')::numeric
      * coalesce(nullif(it->>'model_quantity_purchased', '')::numeric, 1)
    ) as venda
  from pedidos p
  cross join lateral jsonb_array_elements(
    (p.dados_pedido)::jsonb -> 'item_list'
  ) as it
  where p.marketplace = 'shopee'
    and p.dados_pedido is not null
    and jsonb_typeof((p.dados_pedido)::jsonb -> 'item_list') = 'array'
  group by p.id
)
update pedidos p
set valor_total = calc.venda
from calc
where p.id = calc.id
  and calc.venda > 0;
