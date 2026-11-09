// Espelho em TypeScript do mapeamento SQL custos_pedido_linhas(income, buyer)
// (supabase/legado/custos_camadas_8.sql é a versão vigente). Serve para testes de
// regressão com fixtures reais do escrow: a soma das linhas tem de dar escrow_amount.
// A fonte da verdade continua sendo a função SQL; mudou lá, mude aqui.
type J = Record<string, unknown>;
const num = (j: J | undefined | null, k: string) => (j && typeof j[k] === "number" ? (j[k] as number) : 0);

export type LinhaEscrow = { campo: string; categoria: string; valor: number; soma: boolean };

export function linhasEscrow(income: J, buyer: J | null | undefined): LinhaEscrow[] {
  const selling = num(income, "order_selling_price");
  const merchant = num(buyer, "merchant_subtotal");
  const venda = selling > 0 && merchant > 0 ? merchant : selling;
  const rebate = (income.seller_product_rebate as J | undefined) ?? {};
  const linhas: LinhaEscrow[] = [
    { campo: "venda", categoria: "receita", valor: venda, soma: true },
    { campo: "desc_pix", categoria: "desconto_pix", valor: -num(income, "pix_discount"), soma: true },
    { campo: "cupom_vendedor", categoria: "cupom_vendedor", valor: -num(income, "voucher_from_seller"), soma: true },
    { campo: "desc_plataforma_ressarcido", categoria: "cupom_shopee", valor: num(income, "original_shopee_discount"), soma: true },
    { campo: "acao_comercial", categoria: "acao_comercial", valor: -num(rebate, "amount"), soma: true },
    { campo: "frete_comprador", categoria: "frete", valor: num(income, "buyer_paid_shipping_fee"), soma: true },
    { campo: "frete_real", categoria: "frete", valor: -num(income, "actual_shipping_fee"), soma: true },
    { campo: "frete_rebate", categoria: "frete", valor: num(income, "shopee_shipping_rebate"), soma: true },
    { campo: "frete_desc_3pl", categoria: "frete", valor: num(income, "shipping_fee_discount_from_3pl"), soma: true },
    { campo: "frete_desc_vendedor", categoria: "frete", valor: -num(income, "seller_shipping_discount"), soma: true },
    { campo: "frete_reverso", categoria: "frete", valor: -num(income, "reverse_shipping_fee"), soma: true },
    { campo: "frete_retorno", categoria: "frete", valor: -num(income, "final_return_to_seller_shipping_fee"), soma: true },
    { campo: "comissao_bruta", categoria: "comissao", valor: -num(income, "commission_fee"), soma: true },
    { campo: "comissao_rebate", categoria: "comissao_rebate", valor: num(rebate, "commission_fee_offset"), soma: true },
    { campo: "afiliado_comissao", categoria: "afiliado", valor: -num(income, "order_ams_commission_fee"), soma: true },
    { campo: "tx_vendedor", categoria: "taxa_outros", valor: -num(income, "seller_transaction_fee"), soma: true },
    { campo: "campanha", categoria: "taxa_outros", valor: -num(income, "campaign_fee"), soma: true },
    { campo: "fbs", categoria: "taxa_outros", valor: -num(income, "fbs_fee"), soma: true },
    { campo: "sspl", categoria: "taxa_outros", valor: -num(income, "sspl_fee"), soma: true },
    { campo: "manuseio_devolucao", categoria: "taxa_outros", valor: -num(income, "return_handling_fee"), soma: true },
    { campo: "pay_per_sale", categoria: "taxa_outros", valor: -num(income, "pay_per_sale"), soma: true },
    { campo: "ads_top_up", categoria: "taxa_outros", valor: -num(income, "ads_escrow_top_up_fee_or_technical_support_fee"), soma: true },
    { campo: "cashback_moedas", categoria: "taxa_outros", valor: -num(income, "seller_coin_cash_back"), soma: true },
    { campo: "imposto_escrow", categoria: "taxa_outros", valor: -num(income, "escrow_tax"), soma: true },
    { campo: "retencao", categoria: "taxa_outros", valor: -num(income, "withholding_tax"), soma: true },
    { campo: "compensacao_perda", categoria: "compensacao", valor: num(income, "seller_lost_compensation"), soma: true },
    // fora do repasse (memo)
    { campo: "cupom_shopee", categoria: "memo", valor: num(income, "voucher_from_shopee"), soma: false },
    { campo: "moedas", categoria: "memo", valor: num(income, "coins"), soma: false },
    { campo: "promo_pagamento", categoria: "memo", valor: num(income, "payment_promotion"), soma: false },
    { campo: "protecao_produto", categoria: "memo", valor: num(income, "final_product_protection"), soma: false },
  ];
  const servicos = Array.isArray(income.net_service_fee_info_list) ? (income.net_service_fee_info_list as J[]) : [];
  for (const s of servicos) {
    const nome = String(s.rule_display_name || "");
    const rule = Number(s.rule_id || 0);
    const categoria = /afili/i.test(nome) ? "serv_afiliado" : rule === 1000074 ? "serv_transacao" : rule === 1000075 ? "serv_item" : "serv_outros";
    linhas.push({ campo: `serv_${rule}`, categoria, valor: -num(s, "fee_amount"), soma: true });
  }
  return linhas.filter((l) => l.valor !== 0 || l.campo === "venda");
}

export function somaLinhas(linhas: LinhaEscrow[]): number {
  return Math.round(linhas.filter((l) => l.soma).reduce((s, l) => s + l.valor, 0) * 100) / 100;
}
