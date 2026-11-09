-- Tabela de comissão da Shopee numa FUNÇÃO ÚNICA, por período (fonte única da
-- "taxa esperada" da auditoria). A cada mudança de tabela, edite só a função.
--
-- Períodos (data do pedido, horário de Brasília):
--   até 28/02/2026 ........ 20% + R$4 por item, teto R$104/SKU (tabela antiga)
--   01/03 a 30/09/2026 .... faixas por preço, sem teto:
--                            < R$80: 20% + R$4 | 80–99,99: 14% + R$16 | 100–199,99: 14% + R$20 | 200+: 14% + R$26
--   a partir de 01/10/2026  idem, mas a taxa fixa da 1ª faixa sobe de R$4,00 para R$4,50
--                            (comunicado da Shopee; validar nos primeiros escrows de outubro)
-- Nota: os blogs falam de uma faixa de 50% abaixo de R$8/R$9; nos escrows da NGK
-- itens de R$7,99 são cobrados 20% + R$4 (R$5,60), então essa faixa NÃO é modelada.
create or replace function shopee_taxa_esperada_item(preco numeric, dia date)
returns numeric language sql immutable as $$
  select case
    when dia < date '2026-03-01' then least(preco * 0.20 + 4, 104)
    when dia < date '2026-10-01' then
      preco * (case when preco < 80 then 0.20 else 0.14 end)
      + (case when preco < 80 then 4 when preco < 100 then 16 when preco < 200 then 20 else 26 end)
    else
      preco * (case when preco < 80 then 0.20 else 0.14 end)
      + (case when preco < 80 then 4.5 when preco < 100 then 16 when preco < 200 then 20 else 26 end)
  end
$$;

-- View da auditoria: mesma da auditoria_sem_afiliado.sql, só trocando a tabela
-- embutida pela função acima (taxa real continua sem o afiliado).
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
    q * shopee_taxa_esperada_item(preco, (p.data_pedido at time zone 'America/Sao_Paulo')::date)
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
grant execute on function shopee_taxa_esperada_item(numeric, date) to anon, authenticated;
