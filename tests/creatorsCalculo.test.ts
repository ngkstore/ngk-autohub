import { describe, expect, it } from "vitest";
import { CONFIG_PADRAO, custoAmostra, notaCriador, produtoParado, sugestaoAmostra } from "@/lib/creators/calculo";

describe("Creators: produto parado", () => {
  it("estoque >= 300 e vendas 28 d < 2 % do estoque", () => {
    expect(produtoParado(500, 5)).toBe(true); // 5 < 10
    expect(produtoParado(500, 10)).toBe(false); // 10 não é < 10
    expect(produtoParado(200, 0)).toBe(false); // abaixo do mínimo
    expect(produtoParado(500, 5, { ...CONFIG_PADRAO, parado_pct: 0.5 })).toBe(false); // limite configurável
  });
});

describe("Creators: nota do criador (0–100)", () => {
  const forte = { nivel: 6, gmv: 50000, taxa_cumprimento: 100, categorias: ["604206"], ja_vendeu_para_loja: true, media_views_video: 50000 };
  const fraco = { nivel: 1, gmv: 0, taxa_cumprimento: 0, categorias: [], ja_vendeu_para_loja: false, media_views_video: 0 };
  it("máximo = 100 com bônus de parado; mínimo = 0", () => {
    expect(notaCriador(forte, "604206", true).nota).toBe(100); // 110 limitado a 100
    expect(notaCriador(forte, "604206", false).nota).toBe(100); // os pesos somam 100
    expect(notaCriador(fraco, "604206", false).nota).toBe(0);
    // bônus de produto parado soma 10 quando há espaço
    const semNivel = { ...forte, nivel: null, gmv: null };
    expect(notaCriador(semNivel, "604206", true).nota - notaCriador(semNivel, "604206", false).nota).toBe(10);
  });
  it("pesos configuráveis e motivos por componente", () => {
    const r = notaCriador({ ...fraco, ja_vendeu_para_loja: true }, null, false, { ...CONFIG_PADRAO, peso_ja_vendeu: 40 });
    expect(r.nota).toBe(40);
    expect(r.motivos.ja_vendeu).toBe(40);
    expect(r.detalhe.some((d) => d.includes("já vendeu"))).toBe(true);
  });
  it("sem histórico de cumprimento vale metade do peso", () => {
    expect(notaCriador({ ...fraco, taxa_cumprimento: null }, null, false).motivos.cumprimento).toBe(10);
  });
});

describe("Creators: sugestão por pedido de amostra", () => {
  it("aprovar: nota >= 70, ou >= 50 com custo <= R$ 40", () => {
    expect(sugestaoAmostra(75, 100)).toBe("aprovar");
    expect(sugestaoAmostra(55, 30)).toBe("aprovar");
    expect(sugestaoAmostra(55, 45)).toBe("decidir");
  });
  it("recusar: nota < 30 com custo > R$ 40; o resto decide", () => {
    expect(sugestaoAmostra(20, 50)).toBe("recusar");
    expect(sugestaoAmostra(20, 30)).toBe("decidir");
    expect(sugestaoAmostra(20, null)).toBe("decidir");
  });
  it("custo da amostra = custo do SKU + frete estimado", () => {
    expect(custoAmostra(28)).toBe(40);
    expect(custoAmostra(null)).toBeNull();
    expect(custoAmostra(10, { ...CONFIG_PADRAO, frete_amostra: 20 })).toBe(30);
  });
});
