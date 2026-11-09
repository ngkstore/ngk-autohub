-- Auditoria de taxas: a "taxa real" NÃO deve incluir a taxa de serviço de
-- afiliado. taxa_servico (=net_service_fee) já inclui o afiliado por dentro,
-- mas a taxa_esperada (tabela de comissão da Shopee) não tem afiliado nenhum.
-- Sem descontar, pedidos que passaram por afiliado apareciam como falso
-- "cobrado a mais". Afiliado é custo separado (já aparece no DRE à parte).
--
-- Mantém a taxa esperada date-aware (jan-fev = taxa antiga 20%+R$4 teto R$104).
-- Ver [[ngk-autohub-backfill-2026]].
create or replace view pedidos_auditoria as
select
  p.id, p.loja_id, p.marketplace, p.pedido_externo_id, p.cliente_nome,
  p.valor_total, p.taxa_comissao, p.taxa_servico, p.valor_liquido,
  p.data_pagamento, p.data_pedido,
  coalesce(esp.taxa_esperada, 0) as taxa_esperada,
  round((coalesce(p.taxa_comissao, 0) + coalesce(p.taxa_servico, 0) - coalesce(p.taxa_servico_afiliado, 0))::numeric, 2) as taxa_real,
  round(((coalesce(p.taxa_comissao, 0) + coalesce(p.taxa_servico, 0) - coalesce(p.taxa_servico_afiliado, 0)) - coalesce(esp.taxa_esperada, 0))::numeric, 2) as taxa_diferenca
from pedidos p
left join lateral (
  select round(sum(
    q * case
      when (p.data_pedido at time zone 'America/Sao_Paulo')::date < date '2026-03-01'
        then least(preco * 0.20 + 4, 104)  -- taxa antiga jan-fev: 20%+R$4, teto R$104/SKU
      else
        preco * (case when preco < 80 then 0.20 else 0.14 end)
        + (case when preco < 80 then 4 when preco < 100 then 16 when preco < 200 then 20 else 26 end)
    end
  )::numeric, 2) as taxa_esperada
  from (
    select
      coalesce(nullif(it->>'model_quantity_purchased', '')::numeric, 1) as q,
      case when coalesce(nullif(it->>'model_discounted_price', '')::numeric, 0) > 0
           then nullif(it->>'model_discounted_price', '')::numeric
           else coalesce(nullif(it->>'model_original_price', '')::numeric, 0) end as preco
    from jsonb_array_elements((p.dados_pedido)::jsonb -> 'item_list') as it
  ) itens
  where preco > 0
) esp on true
where p.marketplace = 'shopee'
  and p.escrow_atualizado_em is not null
  and coalesce(p.valor_total, 0) > 0
  and jsonb_typeof((p.dados_pedido)::jsonb -> 'item_list') = 'array';

grant select on pedidos_auditoria to anon, authenticated;
