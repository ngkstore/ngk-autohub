// Tradução dos códigos de motivo de devolução (Shopee e TikTok) para a tela.
const SHOPEE: Record<string, string> = {
  NOT_RECEIPT: "Não recebido",
  NOT_RECEIVED: "Não recebido",
  DAMAGED_OTHERS: "Chegou danificado",
  BROKEN_PRODUCTS: "Produto quebrado",
  WRONG_ITEM: "Item errado",
  ITEM_MISSING: "Faltando peça",
  FUNCTIONAL_DMG: "Produto com defeito",
  PHYSICAL_DMG: "Dano físico",
  CHANGE_MIND: "Arrependimento",
  CHANGE_OF_MIND: "Arrependimento",
  ITEM_NOT_FIT: "Não serviu",
  DIFFERENT_DESCRIPTION: "Diferente do anúncio",
  NOT_AS_DESCRIBED: "Diferente do anúncio",
  COUNTERFEIT: "Produto falsificado",
  EXPIRED: "Produto vencido",
  REFUNDABLE_SAMPLE_RR: "Amostra reembolsável",
  OTHER: "Outro",
};

const TIKTOK: [RegExp, string][] = [
  [/not_match_description/, "Diferente do anúncio"],
  [/no_need|no_longer_needed|change_mind|dont_want/, "Arrependimento"],
  [/defective|not_work/, "Produto com defeito"],
  [/damaged|damagaed/, "Chegou danificado"],
  [/not_received|not_receive/, "Não recebido"],
  [/missing_product|missing/, "Faltando peça"],
  [/wrong_product|wrong_item/, "Item errado"],
  [/arrived_too_late|too_late/, "Chegou atrasado"],
  [/unpaid_time_out/, "Não pago (cancelado pelo sistema)"],
  [/created_by_mistakes/, "Pedido criado por engano"],
  [/change_payment_method/, "Troca de forma de pagamento"],
  [/returned_to_shipper/, "Devolvido ao remetente"],
  [/sample_buy_now_refund_later/, "Amostra (reembolso posterior)"],
  [/size|fit/, "Não serviu"],
  [/counterfeit|fake/, "Produto falsificado"],
  [/quality/, "Qualidade abaixo do esperado"],
];

export function motivoLegivel(codigo: string | null | undefined, texto?: string | null): string {
  if (!codigo) return texto || "-";
  const up = codigo.toUpperCase();
  if (SHOPEE[up]) return SHOPEE[up];
  const low = codigo.toLowerCase();
  for (const [re, nome] of TIKTOK) if (re.test(low)) return nome;
  if (texto && texto !== codigo) return texto;
  // último recurso: deixa legível (ecom_order_delivered_refund_reason_xyz → "xyz")
  return low.replace(/^ecom_order_[a-z_]*?_reason_/, "").replace(/_/g, " ");
}

// Grupos usados nos filtros e na análise.
export const GRUPOS_MOTIVO = ["Não recebido", "Chegou danificado", "Item errado", "Faltando peça", "Produto com defeito", "Arrependimento", "Diferente do anúncio", "Não serviu"] as const;
