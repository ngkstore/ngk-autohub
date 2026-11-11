import { describe, expect, it } from "vitest";
import { vendaMediaDia, coberturaDias, pontoPedido, quantidadeComprar, statusSku, disponivelKit, vendaPerdida, fatorDoPeriodo } from "@/lib/estoque/calculo";

describe("cálculo de estoque (D3)", () => {
  it("venda média: 50% 7 d + 30% 28 d + 20% ano anterior", () => {
    // 7 d: 70 (10/dia); 28 d: 224 (8/dia); ano anterior 28 d: 140 (5/dia)
    expect(vendaMediaDia({ v7: 70, v28: 224, vAnoAnterior: 140 })).toBe(5 + 2.4 + 1);
  });
  it("sem ano anterior: 60% 7 d + 40% 28 d × fator sazonal", () => {
    expect(vendaMediaDia({ v7: 70, v28: 224, vAnoAnterior: null })).toBe(6 + 3.2);
    expect(vendaMediaDia({ v7: 70, v28: 224, vAnoAnterior: null }, 1.5)).toBe(13.8);
  });
  it("cobertura e ponto de pedido", () => {
    expect(coberturaDias(190, 96)).toBe(2);
    expect(coberturaDias(10, 0)).toBeNull();
    expect(pontoPedido(96, 15, 5)).toBe(1920);
  });
  it("comprar arredonda para a caixa e desconta em trânsito", () => {
    // 96/dia × (15 + 30) = 4320 − 190 − 0 = 4130 → caixa 50 → 4150
    expect(quantidadeComprar(96, 190, 0, { prazoDias: 15, segurancaDias: 5, diasDesejados: 30, caixa: 50, fatorSazonal: 1 })).toBe(4150);
    expect(quantidadeComprar(96, 190, 4000, { prazoDias: 15, segurancaDias: 5, diasDesejados: 30, caixa: 50, fatorSazonal: 1 })).toBe(150);
    expect(quantidadeComprar(1, 500, 0, { prazoDias: 15, segurancaDias: 5, diasDesejados: 30, caixa: null, fatorSazonal: 1 })).toBe(0);
  });
  it("status", () => {
    expect(statusSku(0, 18, 120, 15, 5)).toBe("ruptura");
    expect(statusSku(190, 96, 2000, 15, 5)).toBe("critico"); // cobertura 2 d < prazo 15
    expect(statusSku(1800, 96, 2000, 15, 5)).toBe("atencao"); // cobertura 18,8 d ≥ 15 mas < ponto 1920
    expect(statusSku(3000, 96, 2000, 15, 5)).toBe("ok");
    expect(statusSku(610, 4, 100, 15, 5)).toBe("excesso"); // 152 d
    expect(statusSku(120, 0, 0, 15, 5)).toBe("parado");
  });
  it("kit: menor componente ÷ quantidade", () => {
    expect(disponivelKit([{ disponivel: 100, quantidade: 4 }, { disponivel: 30, quantidade: 1 }])).toBe(25);
    expect(disponivelKit([])).toBe(0);
  });
  it("venda perdida", () => {
    // 96/dia, 190 disponíveis (2 d), reposição 15 d → 13 dias sem estoque × 96 × R$ 30 = 37.440
    expect(vendaPerdida(96, 190, 15, 30)).toBeCloseTo(96 * (15 - 190 / 96) * 30, 2);
    expect(vendaPerdida(1, 500, 15, 30)).toBe(0);
  });
  it("fator sazonal do período", () => {
    const f = [{ inicio: "2026-11-20", fim: "2026-11-30", fator: 1.8 }];
    expect(fatorDoPeriodo(f, new Date("2026-11-25T12:00:00Z"))).toBe(1.8);
    expect(fatorDoPeriodo(f, new Date("2026-11-05T12:00:00Z"))).toBe(1);
  });
});
