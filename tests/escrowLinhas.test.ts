import { describe, expect, it } from "vitest";
import { linhasEscrow, somaLinhas } from "@/lib/shopee/escrowLinhas";
import pix from "./fixtures/escrow-pix.json";
import afiliado from "./fixtures/escrow-afiliado.json";
import devolucao from "./fixtures/escrow-frete.json";
import sellingZero from "./fixtures/escrow-selling-zero.json";

type Fx = { pedido: string; order_income: Record<string, unknown>; buyer_payment_info: Record<string, unknown> };

// Fixtures reais do get_escrow_detail (NGK, jul–nov/2026). Regra de ouro da Camada 1:
// soma das linhas com soma=true == escrow_amount (Renda do pedido).
describe("linhas do escrow fecham com a renda do pedido", () => {
  for (const fx of [pix, afiliado, devolucao, sellingZero] as Fx[]) {
    it(`pedido ${fx.pedido}`, () => {
      const linhas = linhasEscrow(fx.order_income, fx.buyer_payment_info);
      expect(somaLinhas(linhas)).toBe(Number(fx.order_income.escrow_amount));
    });
  }
});

describe("pedido Pix (261106KN74E68A): desconto compensado nos abatimentos", () => {
  const linhas = linhasEscrow((pix as Fx).order_income, (pix as Fx).buyer_payment_info);
  const v = (campo: string) => linhas.find((l) => l.campo === campo)?.valor ?? 0;
  it("renda do pedido 10,62", () => expect(somaLinhas(linhas)).toBe(10.62));
  it("comissão bruta 3,52 com abatimento 1,11", () => {
    expect(v("comissao_bruta")).toBe(-3.52);
    expect(v("comissao_rebate")).toBe(1.11);
  });
  it("taxa por item já líquida (3,09 = 4,50 − 1,41) — não somar o abatimento de novo", () => {
    expect(v("serv_1000075")).toBe(-3.09);
    expect(linhas.find((l) => l.campo === "serv_rebate")).toBeUndefined();
  });
  it("desconto da plataforma 2,52 ressarcido e cobrado como ação comercial (anulam)", () => {
    expect(v("desc_plataforma_ressarcido")).toBe(2.52);
    expect(v("acao_comercial")).toBe(-2.52);
  });
});

describe("pedido com afiliado (2610083GS7UHXE)", () => {
  const linhas = linhasEscrow((afiliado as Fx).order_income, (afiliado as Fx).buyer_payment_info);
  it("comissão do afiliado e taxa de serviço do afiliado em linhas separadas", () => {
    expect(linhas.find((l) => l.categoria === "afiliado")?.valor).toBe(-1.75);
    expect(linhas.find((l) => l.categoria === "serv_afiliado")?.valor).toBe(-0.24);
  });
  it("taxa de serviço do afiliado ≈ 14% da comissão", () => {
    expect(0.24 / 1.75).toBeGreaterThan(0.12);
    expect(0.24 / 1.75).toBeLessThan(0.15);
  });
});

describe("devolução total (2610070TBMSPBW): só frete sobra", () => {
  const linhas = linhasEscrow((devolucao as Fx).order_income, (devolucao as Fx).buyer_payment_info);
  it("renda −69,25 = frete real −54,25 + reverso −15,00", () => {
    expect(somaLinhas(linhas)).toBe(-69.25);
    expect(linhas.filter((l) => l.categoria === "frete" && l.soma).reduce((s, l) => s + l.valor, 0)).toBeCloseTo(-69.25, 2);
  });
});

describe("pedido jul/2026 (2607219VK9RDNX): order_selling_price = 0 sem devolução", () => {
  const fx = sellingZero as Fx;
  const linhas = linhasEscrow(fx.order_income, fx.buyer_payment_info);
  const v = (campo: string) => linhas.find((l) => l.campo === campo)?.valor ?? 0;
  it("venda = merchant_subtotal 24,90 (não é devolução total)", () => expect(v("venda")).toBe(24.9));
  it("renda do pedido 15,92", () => expect(somaLinhas(linhas)).toBe(15.92));
  it("regras antigas classificadas: 100623 transação, 100640 por item", () => {
    expect(linhas.find((l) => l.campo === "serv_100623")?.categoria).toBe("serv_transacao");
    expect(linhas.find((l) => l.campo === "serv_100640")?.categoria).toBe("serv_item");
  });
});
