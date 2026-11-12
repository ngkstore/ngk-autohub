// Estimativa da receita líquida de pedidos ainda sem extrato/escrow (puro; espelha
// liquida_estimada_tiktok() do banco — manter as duas iguais).
export const TAXA_SERVICO_TIKTOK = 0.06;

/** Comissão do TikTok Shop: 10 % + R$ 4 abaixo de R$ 50; 6 % + R$ 6 a partir de R$ 50. */
export const comissaoTikTok = (valor: number) => (valor < 50 ? 0.1 * valor + 4 : 0.06 * valor + 6);

/** Líquido estimado = valor − comissão − taxa de serviço 6 % − comissão de afiliado do pedido − frete médio cobrado. */
export function liquidaEstimadaTikTok(valor: number, afiliado = 0, freteMedio = 0): number {
  return Math.round((valor - comissaoTikTok(valor) - TAXA_SERVICO_TIKTOK * valor - (afiliado || 0) - (freteMedio || 0)) * 100) / 100;
}

/** Shopee sem escrow: valor × razão líquido/bruto dos pedidos com escrow da loja (30 d). */
export const liquidaEstimadaShopee = (valor: number, ratio: number) => Math.round(valor * (ratio || 0.72) * 100) / 100;
