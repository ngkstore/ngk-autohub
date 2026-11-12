import { describe, expect, it } from "vitest";
import { calcularResultado } from "@/lib/financas/resultado";

describe("resultado do período (Finanças e Visão geral usam a mesma conta)", () => {
  const r = {
    receita_bruta: 1000, taxas: -200, taxa_servico_afiliado: -10, cupom_proprio: -30, afiliado: -50,
    receita_liquida: 700, ads: 100, reembolsos: 20, imposto: 60, frete_custo: 0, reembolsos_tiktok: 5,
    acelera_taxa: 3, estornos: 2, compensacoes: 4, difal: 1, ajustes: 6, afiliado_ajuste: 7,
  };
  const c = { cmv: 300, itens_total: 200, itens_com_custo: 150 };

  it("resultado = líquida + reemb. TikTok − ads − reembolsos − imposto − extras da carteira", () => {
    const x = calcularResultado(r, c);
    expect(x.taxas).toBe(190); // taxas sem a de afiliado
    expect(x.extrasCarteira).toBe(3 + 2 + 1 + 6 + 7 - 4);
    expect(x.resultado).toBe(700 + 5 - 100 - 20 - 60 - 15);
    expect(x.lucro).toBe(x.resultado - 300);
    expect(x.cobertura).toBe(75);
    expect(x.margemLucro).toBeCloseTo((x.lucro / 1000) * 100, 6);
  });
  it("pedidos sem extrato: entra o líquido ESTIMADO, nunca 0 − CMV", () => {
    const x = calcularResultado({ receita_bruta: 11987.52, receita_liquida: 0, receita_liquida_estimada: 8600, qtd_liquidados: 0, qtd_estimados: 167 }, { cmv: 2295.6, itens_total: 10, itens_com_custo: 10 });
    expect(x.liquidaTotal).toBe(8600);
    expect(x.resultado).toBe(8600);
    expect(x.lucro).toBeCloseTo(8600 - 2295.6, 2);
    expect(x.lucro).toBeGreaterThan(0);
  });
  it("sem dados: tudo zero (sem NaN)", () => {
    const x = calcularResultado(null, undefined);
    expect(x.receita).toBe(0);
    expect(x.lucro).toBe(0);
    expect(x.margem).toBe(0);
    expect(x.cobertura).toBe(0);
  });
});
