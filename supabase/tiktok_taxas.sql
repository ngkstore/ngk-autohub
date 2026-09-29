-- Taxas do TikTok Shop BR por período — FONTE ÚNICA, medida nos extratos da API
-- (finance/statement_transactions) em 29/09/2026, por DATA DO PEDIDO (Brasília).
-- Base de cálculo da TikTok: preço do item DEPOIS do desconto do vendedor
-- (sem contar desconto/cupom da plataforma). Por item; multiplicar pela quantidade.
--
--   lançamento → 23/09/2025 : comissão 0% e sem taxa fixa (promoção de entrada)
--   24/09/2025 → 04/02/2026 : 6% + R$2 por item (abaixo de R$50 consistente; acima de R$50 variou entre R$0/2/4)
--   05/02/2026 → 14/07/2026 : 6% + R$4 por item
--   15/07/2026 →            : < R$50: 10% + R$4  |  >= R$50: 6% + R$6
--   Programa de Frete Grátis (sfp_service_fee): 6% do preço, desde o lançamento, sem mudança.
-- Fora da função (variam por pedido): comissão de afiliado (taxa do criador, 7–8% típico)
-- e comissão de Shop Ads de afiliado — vêm discriminadas no extrato de cada pedido.
create or replace function tiktok_taxa_esperada_item(preco numeric, dia date)
returns numeric language sql immutable as $$
  select
    preco * 0.06  -- Programa de Frete Grátis
    + case
        when dia < date '2025-09-24' then 0
        when dia < date '2026-02-05' then preco * 0.06 + 2
        when dia < date '2026-07-15' then preco * 0.06 + 4
        else (case when preco < 50 then preco * 0.10 + 4 else preco * 0.06 + 6 end)
      end
$$;
grant execute on function tiktok_taxa_esperada_item(numeric, date) to anon, authenticated;
