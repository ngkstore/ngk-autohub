-- Auditoria de taxas (cálculo ITEM A ITEM / por SKU vendido).
-- Para cada item do pedido, a faixa é definida pelo PREÇO DO ITEM, e a taxa
-- fixa é multiplicada pela quantidade:
--   preço < 80    -> 20% do item + R$ 4  por unidade
--   80–99,99      -> 14% do item + R$ 16 por unidade
--   100–199,99    -> 14% do item + R$ 20 por unidade
--   200+          -> 14% do item + R$ 26 por unidade
-- Ex.: 2 balanças de 16,89 = 2 x (16,89*20% + 4) = 2 x 7,378 = 14,76.
--
-- Usa o item_list salvo em dados_pedido (preço = model_discounted_price).
-- Rode UMA vez no Supabase -> SQL Editor -> Run (seguro rodar de novo).

create or replace view pedidos_auditoria as
select
  x.id,
  x.loja_id,
  x.marketplace,
  x.pedido_externo_id,
  x.cliente_nome,
  x.valor_total,
  x.taxa_comissao,
  x.taxa_servico,
  x.valor_liquido,
  x.data_pagamento,
  x.data_pedido,
  x.taxa_esperada,
  x.taxa_real,
  round((x.taxa_real - x.taxa_esperada)::numeric, 2) as taxa_diferenca
from (
  select
    p.id,
    p.loja_id,
    p.marketplace,
    p.pedido_externo_id,
    p.cliente_nome,
    p.valor_total,
    p.taxa_comissao,
    p.taxa_servico,
    p.valor_liquido,
    p.data_pagamento,
    p.data_pedido,
    round(
      (coalesce(p.taxa_comissao, 0) + coalesce(p.taxa_servico, 0))::numeric,
      2
    ) as taxa_real,
    coalesce((
      select round(sum(
        coalesce(nullif(it->>'model_quantity_purchased', '')::numeric, 1) *
        (
          (it->>'model_discounted_price')::numeric *
          (case
             when (it->>'model_discounted_price')::numeric < 80 then 0.20
             else 0.14
           end)
          +
          (case
             when (it->>'model_discounted_price')::numeric < 80 then 4
             when (it->>'model_discounted_price')::numeric < 100 then 16
             when (it->>'model_discounted_price')::numeric < 200 then 20
             else 26
           end)
        )
      )::numeric, 2)
      from jsonb_array_elements((p.dados_pedido)::jsonb -> 'item_list') as it
      where (it->>'model_discounted_price') is not null
    ), 0) as taxa_esperada
  from pedidos p
  where p.marketplace = 'shopee'
    and p.escrow_atualizado_em is not null
    and coalesce(p.valor_total, 0) > 0
    and jsonb_typeof((p.dados_pedido)::jsonb -> 'item_list') = 'array'
) x;

grant select on pedidos_auditoria to anon, authenticated;

-- Resumo agregado da auditoria (sem limite de 1000 linhas).
create or replace function auditoria_resumo(
  p_loja_id uuid default null,
  p_inicio timestamptz default null,
  p_fim timestamptz default null
)
returns json
language sql
stable
as $$
  with base as (
    select *
    from pedidos_auditoria
    where (p_loja_id is null or loja_id = p_loja_id)
      and (p_inicio is null or coalesce(data_pagamento, data_pedido) >= p_inicio)
      and (p_fim is null or coalesce(data_pagamento, data_pedido) < p_fim)
  )
  select json_build_object(
    'pedidos', (select count(*) from base),
    'divergentes', (select count(*) from base where abs(taxa_diferenca) > 0.50),
    'taxa_esperada_total', (select coalesce(sum(taxa_esperada), 0) from base),
    'taxa_real_total', (select coalesce(sum(taxa_real), 0) from base),
    'diferenca_total', (select coalesce(sum(taxa_diferenca), 0) from base),
    'cobrado_a_mais', (
      select coalesce(sum(taxa_diferenca) filter (where taxa_diferenca > 0), 0) from base
    ),
    'cobrado_a_menos', (
      select coalesce(sum(taxa_diferenca) filter (where taxa_diferenca < 0), 0) from base
    )
  );
$$;

grant execute on function auditoria_resumo(uuid, timestamptz, timestamptz) to anon, authenticated;
