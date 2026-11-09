// Classificação das transações da carteira Shopee — módulo PURO (sem Supabase) para
// poder ser testado (tests/carteira.test.ts) e usado pelo sincronizador.
// Classificação pelo TIPO da transação (o texto muda, o tipo não). Espelho da
// tabela carteira_categorias + classificar_carteira() do banco (fonte da
// verdade): depois do upsert o sync chama reclassificar_carteira(loja), então
// um tipo novo cadastrado na tabela vale sem redeploy.
const MAPA_TIPO: Record<string, string> = {
  ESCROW_VERIFIED_ADD: "renda",
  ESCROW_VERIFIED_MINUS: "estorno",
  FAST_ESCROW_DISBURSE: "antecipacao",
  FAST_ESCROW_DISBURSE_REMAINING: "antecipacao",
  FAST_ESCROW_DEDUCT: "acelera_taxa",
  ESCROW_DEDUCT: "acelera_taxa",
  SPM_DEDUCT: "ads",
  SPM_DEDUCT_DIRECT: "emprestimo",
  SPM_DISBURSE_ADD: "emprestimo_entrada",
  PAID_BY_WALLET: "pagamento_carteira",
  APM_DEDUCT: "pagamento_carteira",
  ADJUSTMENT_FOR_RR_AFTER_ESCROW_VERIFIED: "reembolso",
  ADJUSTMENT_CENTER_DEDUCT: "ajuste_debito",
  ADJUSTMENT_CENTER_ADD: "compensacao",
  FULFILMENT_COMPENSATE_ADD: "compensacao",
  RETURN_COMPENSATION_SERVICE_ADD: "compensacao",
  LOST_PARCEL_SELLER_ADD: "compensacao",
  SELLER_COMPENSATE_ADD: "compensacao",
  AMS_COMMISSION_FEE_DEDUCT: "afiliado_ajuste",
  AFFILIATE_FEE_DEDUCT: "afiliado_ajuste",
  AFFILIATE_SAMPLE_SHIPPING_FEE_DEDUCT: "afiliado_ajuste",
  BR_DIFAL_FEE_CHARGE: "difal",
  FBS_ADJUSTMENT_MINUS: "logistica_full",
  FBS_FEE_CHARGE_MINUS: "logistica_full",
  WITHDRAWAL_CREATED: "saque",
  WITHDRAWAL_COMPLETED: "saque",
  PIX_TRANSFER_SEND_CREATED: "saque",
  PIX_TRANSFER_SEND_COMPLETED: "saque",
};

export function categoriaCarteira(tipo: string | null | undefined, descricao: string): string {
  const d = (descricao || "").toLowerCase();
  if (!tipo) return d.includes("reembolso por objeto perdido") ? "compensacao" : "desconhecido";
  if (tipo === "ADJUSTMENT_CENTER_DEDUCT") {
    if (d.includes("difal") || d.includes("diferencial de al")) return "difal";
    if (d.includes("volumoso")) return "logistica_volumoso";
    if (d.includes("cubad")) return "logistica_peso";
    if (d.includes("creditado a maior")) return "estorno_credito";
    return "ajuste_debito";
  }
  // SPM_DEDUCT_DIRECT (tipo 801 no Seller Center) é parcela do "Empréstimo para
  // Vendedores"; só vira ads com texto de recarga. Texto desconhecido -> desconhecido
  // (alerta na conferência 8), nunca ads por padrão (F3 do plano de melhorias).
  if (tipo === "SPM_DEDUCT_DIRECT") {
    if ((d.includes("empr") && d.includes("stimo")) || d.includes("loan")) return "emprestimo";
    if (d.includes("ads") || d.includes("anúncio") || d.includes("anuncio") || d.includes("recarga")) return "ads";
    return "desconhecido";
  }
  return MAPA_TIPO[tipo] ?? "desconhecido";
}

