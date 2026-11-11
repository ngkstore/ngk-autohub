-- 0009 (11/11/2026): pedidos de jul–nov/2026 vieram da API com order_selling_price = 0 mesmo sem
-- devolução (repasse > 0). Não é devolução total: a venda é merchant_subtotal. Regra: selling
-- efetivo = merchant_subtotal quando selling = 0, sem devolução e repasse > 0. Os 500 casos
-- que estavam no balde "em ajuste"/diferença passam a fechar.
set statement_timeout = '15min';

create or replace function custos_pedido_linhas(inc jsonb, buy jsonb)
returns table(campo text, rotulo text, grupo text, categoria text, valor numeric, soma boolean)
language sql immutable as $$
  with b0 as (
    select case when jnum(inc,'order_selling_price') = 0 and jnum(inc,'seller_return_refund') = 0
                 and jnum(inc,'escrow_amount') > 0 and jnum(coalesce(buy,'{}'::jsonb),'merchant_subtotal') > 0
            then jnum(coalesce(buy,'{}'::jsonb),'merchant_subtotal')
            else jnum(inc,'order_selling_price') end as selling_ef
  ),
  base as (
    select
      -- Devolução PARCIAL (seller_return_refund <> 0): o que ficou é order_selling_price; senão merchant_subtotal.
      case when jnum(inc,'seller_return_refund') <> 0 then b0.selling_ef
           when b0.selling_ef > 0 and jnum(coalesce(buy,'{}'::jsonb),'merchant_subtotal') > 0
           then jnum(coalesce(buy,'{}'::jsonb),'merchant_subtotal') else b0.selling_ef end as venda,
      jnum(inc,'order_selling_price') as selling_price,
      -- Pedido totalmente devolvido (order_selling_price = 0): a Shopee não ressarce o desconto da plataforma.
      case when b0.selling_ef > 0 then jnum(inc,'original_shopee_discount') else 0 end as desc_plataforma,
      jnum(inc,'pix_discount') as desc_pix,
      jnum(inc,'voucher_from_seller') as cupom_vendedor,
      jnum(inc->'seller_product_rebate','amount') as acao_comercial,
      jnum(inc,'voucher_from_shopee') as cupom_shopee,
      jnum(inc,'coins') as moedas,
      jnum(inc,'payment_promotion') as promo_pgto,
      jnum(inc,'credit_card_promotion') as promo_cartao,
      jnum(inc,'buyer_paid_shipping_fee') as frete_comprador,
      jnum(inc,'actual_shipping_fee') as frete_real,
      jnum(inc,'shopee_shipping_rebate') as frete_rebate,
      jnum(inc,'shipping_fee_discount_from_3pl') as frete_desc_3pl,
      jnum(inc,'seller_shipping_discount') as frete_desc_vendedor,
      jnum(inc,'reverse_shipping_fee') as frete_reverso,
      jnum(inc,'final_return_to_seller_shipping_fee') as frete_retorno,
      jnum(inc,'commission_fee') as comissao_bruta,
      jnum(inc->'seller_product_rebate','commission_fee_offset') as comissao_rebate,
      jnum(inc->'seller_product_rebate','service_fee_offset') as serv_rebate,
      jnum(inc,'service_fee') as serv_bruta,
      jnum(inc,'order_ams_commission_fee') as afiliado,
      jnum(inc,'seller_transaction_fee') as tx_vendedor,
      jnum(inc,'campaign_fee') as campanha,
      jnum(inc,'fbs_fee') as fbs,
      jnum(inc,'sspl_fee') as sspl,
      jnum(inc,'return_handling_fee') as manuseio_dev,
      jnum(inc,'pay_per_sale') as pay_per_sale,
      jnum(inc,'ads_escrow_top_up_fee_or_technical_support_fee') as ads_top_up,
      jnum(inc,'seller_lost_compensation') as comp_perda,
      jnum(inc,'seller_coin_cash_back') as cashback,
      jnum(inc,'escrow_tax') as imposto_escrow,
      jnum(inc,'withholding_tax') as retencao,
      jnum(inc,'final_product_protection') as protecao,
      jnum(inc,'escrow_amount') as repasse
    from b0
  ),
  servicos as (
    select coalesce(nullif(s->>'rule_id','')::bigint, 0) as rule_id,
           coalesce(s->>'rule_display_name','') as nome,
           coalesce(nullif(s->>'fee_amount','')::numeric, 0) as fee
    from jsonb_array_elements(case when jsonb_typeof(inc->'net_service_fee_info_list') = 'array' then inc->'net_service_fee_info_list' else '[]'::jsonb end) s
  ),
  linhas as (
    -- Produtos
    select 'venda'::text campo, 'Preço de venda (subtotal do vendedor)'::text rotulo, 'produtos'::text grupo, 'receita'::text categoria, venda valor, true soma from base
    union all select 'desc_pix', 'Desconto Pix ao comprador (compensado nos abatimentos)', 'produtos', 'desconto_pix', -desc_pix, true from base
    union all select 'cupom_vendedor', 'Cupom do vendedor', 'produtos', 'cupom_vendedor', -cupom_vendedor, true from base
    union all select 'desc_plataforma_ressarcido', 'Desconto da plataforma / Pix ressarcido pela Shopee', 'produtos', 'cupom_shopee', desc_plataforma, true from base
    union all select 'acao_comercial', 'Participação em ação comercial (cupom / Pix por conta do vendedor)', 'taxas', 'acao_comercial', -acao_comercial, true from base
    -- Frete (51 + 52 + 54 = 50)
    union all select 'frete_comprador', 'Frete pago pelo comprador', 'frete', 'frete', frete_comprador, true from base
    union all select 'frete_real', 'Frete cobrado pelo parceiro logístico', 'frete', 'frete', -frete_real, true from base
    union all select 'frete_rebate', 'Desconto de frete pago pela Shopee', 'frete', 'frete', frete_rebate, true from base
    union all select 'frete_desc_3pl', 'Desconto de frete da transportadora', 'frete', 'frete', frete_desc_3pl, true from base
    union all select 'frete_desc_vendedor', 'Desconto de frete do vendedor', 'frete', 'frete', -frete_desc_vendedor, true from base
    union all select 'frete_reverso', 'Frete de devolução (reverso)', 'frete', 'frete', -frete_reverso, true from base
    union all select 'frete_retorno', 'Frete de retorno ao vendedor', 'frete', 'frete', -frete_retorno, true from base
    -- Taxas Shopee
    union all select 'comissao_bruta', 'Taxa de comissão bruta', 'taxas', 'comissao', -comissao_bruta, true from base
    union all select 'comissao_rebate', 'Abatimento de comissão (ação comercial / Pix)', 'taxas', 'comissao_rebate', comissao_rebate, true from base
    union all select 'serv_' || s.rule_id, coalesce(r.rotulo, nullif(s.nome,''), 'Taxa de serviço (regra ' || s.rule_id || ')'), 'taxas',
                     case when s.nome ilike '%afili%' then 'serv_afiliado' else coalesce(r.categoria, 'serv_outros') end,
                     -s.fee, true
             from servicos s left join escrow_regras_servico r on r.rule_id = s.rule_id
    union all select 'serv_rebate', 'Abatimento da taxa de serviço (já dentro dos sub-itens)', 'taxas', 'serv_rebate', serv_rebate, false from base
    union all select 'serv_bruta', 'Taxa de serviço bruta (total)', 'taxas', 'memo', -serv_bruta, false from base
    union all select 'tx_vendedor', 'Taxa de transação do vendedor', 'taxas', 'taxa_outros', -tx_vendedor, true from base
    union all select 'campanha', 'Taxa de campanha', 'taxas', 'taxa_outros', -campanha, true from base
    union all select 'fbs', 'Taxa do Full (FBS)', 'taxas', 'taxa_outros', -fbs, true from base
    union all select 'sspl', 'Taxa SSPL', 'taxas', 'taxa_outros', -sspl, true from base
    union all select 'manuseio_devolucao', 'Taxa de manuseio de devolução', 'taxas', 'taxa_outros', -manuseio_dev, true from base
    union all select 'pay_per_sale', 'Pay per sale', 'taxas', 'taxa_outros', -pay_per_sale, true from base
    union all select 'ads_top_up', 'Ads (recarga pelo escrow) / suporte técnico', 'taxas', 'taxa_outros', -ads_top_up, true from base
    union all select 'cashback_moedas', 'Cashback em moedas (vendedor)', 'taxas', 'taxa_outros', -cashback, true from base
    union all select 'imposto_escrow', 'Imposto retido no escrow', 'taxas', 'taxa_outros', -imposto_escrow, true from base
    union all select 'retencao', 'Retenção na fonte', 'taxas', 'taxa_outros', -retencao, true from base
    -- Afiliado
    union all select 'afiliado_comissao', 'Taxa de comissão Afiliados do Vendedor', 'afiliado', 'afiliado', -afiliado, true from base
    -- Compensações dentro do pedido
    union all select 'compensacao_perda', 'Compensação por perda (vendedor)', 'outros', 'compensacao', comp_perda, true from base
    union all select 'protecao_produto', 'Seguro / proteção do produto pago pelo comprador (fora do repasse)', 'memo', 'memo', protecao, false from base
    -- Memo (não somam): lado do comprador / informativo
    union all select 'selling_price', 'Preço de venda informado pela API (order_selling_price)', 'memo', 'memo', selling_price, false from base
    union all select 'promo_pagamento', 'Promoção de pagamento ao comprador (fora do repasse)', 'memo', 'memo', promo_pgto, false from base
    union all select 'promo_cartao', 'Promoção de cartão ao comprador (fora do repasse)', 'memo', 'memo', promo_cartao, false from base
    union all select 'cupom_shopee', 'Cupom da Shopee ao comprador (fora do repasse)', 'memo', 'memo', cupom_shopee, false from base
    union all select 'moedas', 'Moedas Shopee usadas pelo comprador (fora do repasse)', 'memo', 'memo', moedas, false from base
    union all select 'preco_original', 'Preço original', 'memo', 'memo', jnum(inc,'order_original_price'), false from base
    union all select 'desconto_vendedor', 'Desconto do vendedor', 'memo', 'memo', -jnum(inc,'order_seller_discount'), false from base
    union all select 'devolucao_vendedor', 'Reembolso ao comprador (devolução)', 'memo', 'memo', jnum(inc,'seller_return_refund'), false from base
    union all select 'drc_ajustavel', 'Reembolso ajustável (DRC)', 'memo', 'memo', jnum(inc,'drc_adjustable_refund'), false from base
    union all select 'comprador_pagou', 'Total pago pelo comprador', 'memo', 'memo', jnum(inc,'buyer_total_amount'), false from base
    union all select 'ajuste_total', 'Ajustes posteriores (total)', 'memo', 'memo', jnum(inc,'total_adjustment_amount'), false from base
    union all select 'repasse_ajustado', 'Renda do pedido após ajustes', 'total', 'memo', jnum(inc,'escrow_amount_after_adjustment'), false from base
  ),
  tot as (select coalesce(sum(valor) filter (where soma), 0) as s from linhas)
  select l.campo, l.rotulo, l.grupo, l.categoria, round(l.valor, 2), l.soma from linhas l where l.valor <> 0 or l.campo = 'venda'
  union all select 'repasse', 'Renda do pedido', 'total', 'repasse', round(b.repasse, 2), false from base b
  union all select 'residual', 'Não mapeado (repasse − soma das linhas)', 'total', 'residual', round(b.repasse - t.s, 2), false from base b, tot t
$$;
