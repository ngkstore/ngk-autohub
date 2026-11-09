import { describe, expect, it } from "vitest";
import { categoriaCarteira } from "@/lib/shopee/carteiraCategorias";

// Espelho da tabela carteira_categorias + classificar_carteira() do banco.
describe("categoriaCarteira — um caso por tipo", () => {
  const casos: [string, string][] = [
    ["ESCROW_VERIFIED_ADD", "renda"],
    ["ESCROW_VERIFIED_MINUS", "estorno"],
    ["FAST_ESCROW_DISBURSE", "antecipacao"],
    ["FAST_ESCROW_DISBURSE_REMAINING", "antecipacao"],
    ["FAST_ESCROW_DEDUCT", "acelera_taxa"],
    ["ESCROW_DEDUCT", "acelera_taxa"],
    ["SPM_DEDUCT", "ads"],
    ["SPM_DISBURSE_ADD", "emprestimo_entrada"],
    ["PAID_BY_WALLET", "pagamento_carteira"],
    ["APM_DEDUCT", "pagamento_carteira"],
    ["ADJUSTMENT_FOR_RR_AFTER_ESCROW_VERIFIED", "reembolso"],
    ["ADJUSTMENT_CENTER_ADD", "compensacao"],
    ["FULFILMENT_COMPENSATE_ADD", "compensacao"],
    ["RETURN_COMPENSATION_SERVICE_ADD", "compensacao"],
    ["LOST_PARCEL_SELLER_ADD", "compensacao"],
    ["SELLER_COMPENSATE_ADD", "compensacao"],
    ["AMS_COMMISSION_FEE_DEDUCT", "afiliado_ajuste"],
    ["AFFILIATE_FEE_DEDUCT", "afiliado_ajuste"],
    ["AFFILIATE_SAMPLE_SHIPPING_FEE_DEDUCT", "afiliado_ajuste"],
    ["BR_DIFAL_FEE_CHARGE", "difal"],
    ["FBS_ADJUSTMENT_MINUS", "logistica_full"],
    ["FBS_FEE_CHARGE_MINUS", "logistica_full"],
    ["WITHDRAWAL_CREATED", "saque"],
    ["WITHDRAWAL_COMPLETED", "saque"],
    ["PIX_TRANSFER_SEND_CREATED", "saque"],
    ["PIX_TRANSFER_SEND_COMPLETED", "saque"],
  ];
  for (const [tipo, esperado] of casos) {
    it(`${tipo} -> ${esperado}`, () => {
      expect(categoriaCarteira(tipo, "qualquer texto")).toBe(esperado);
    });
  }
  it("tipo desconhecido -> desconhecido", () => {
    expect(categoriaCarteira("TIPO_NOVO_XYZ", "texto")).toBe("desconhecido");
  });
});

describe("ADJUSTMENT_CENTER_DEDUCT — subclasse pelo texto", () => {
  const t = "ADJUSTMENT_CENTER_DEDUCT";
  it("DIFAL", () => expect(categoriaCarteira(t, "Débito por diferencial de alíquota do ICMS (DIFAL) cobrada pelo fisco")).toBe("difal"));
  it("item volumoso", () => expect(categoriaCarteira(t, "Débito por manuseio de item volumoso")).toBe("logistica_volumoso"));
  it("peso cubado", () => expect(categoriaCarteira(t, "Débito por diferença de peso cubado")).toBe("logistica_peso"));
  it("crédito a maior", () => expect(categoriaCarteira(t, "Estorno de valor creditado a maior")).toBe("estorno_credito"));
  it("outro texto", () => expect(categoriaCarteira(t, "Ajuste genérico")).toBe("ajuste_debito"));
});

describe("SPM_DEDUCT_DIRECT — empréstimo × ads × desconhecido (F3)", () => {
  const t = "SPM_DEDUCT_DIRECT";
  it("parcela do empréstimo", () => expect(categoriaCarteira(t, "Pagamento do Empréstimo para Vendedores")).toBe("emprestimo"));
  it("recarga de ads", () => expect(categoriaCarteira(t, "Recarga por compra de ADS")).toBe("ads"));
  it("texto desconhecido NÃO vira ads", () => expect(categoriaCarteira(t, "Débito diverso")).toBe("desconhecido"));
});

describe("transação sem tipo", () => {
  it("'Reembolso por objeto perdido' é compensação", () => expect(categoriaCarteira(null, "Reembolso por objeto perdido")).toBe("compensacao"));
  it("outro texto sem tipo -> desconhecido", () => expect(categoriaCarteira(undefined, "qualquer")).toBe("desconhecido"));
});
