import { describe, expect, it } from "vitest";
import { CONFIG_PADRAO, custoAmostra, freteEstimado, notaCriador, pontosCategoria, pontosNivelGmv, produtoParado, sugestaoAmostra } from "@/lib/creators/calculo";

describe("Creators: produto parado", () => {
  it("estoque >= 300 e vendas 28 d < 2 % do estoque", () => {
    expect(produtoParado(500, 5)).toBe(true);
    expect(produtoParado(500, 10)).toBe(false);
    expect(produtoParado(200, 0)).toBe(false);
    expect(produtoParado(500, 5, { ...CONFIG_PADRAO, parado_pct: 0.5 })).toBe(false);
  });
});

describe("Creators: bloco nível e GMV (T-003: o maior entre nível e GMV)", () => {
  it("escala: 7+/500k=35, 6/200k=31, 5/100k=27, 4/40k=22, 3/15k=16, 2/5k=10, 1k=5, abaixo 0", () => {
    expect(pontosNivelGmv(7, 0)).toBe(35);
    expect(pontosNivelGmv(null, 500000)).toBe(35);
    expect(pontosNivelGmv(6, 0)).toBe(31);
    expect(pontosNivelGmv(null, 565846)).toBe(35); // @dicasdamay62 pelo GMV
    expect(pontosNivelGmv(4, 71900)).toBe(22); // nível 4 > faixa do GMV (40k–100k também dá 22)
    expect(pontosNivelGmv(null, 71900)).toBe(22);
    expect(pontosNivelGmv(2, 0)).toBe(10);
    expect(pontosNivelGmv(null, 1000)).toBe(5);
    expect(pontosNivelGmv(1, 500)).toBe(0);
    expect(pontosNivelGmv(null, null)).toBe(0);
  });
  it("pontos escalam com o peso configurado", () => {
    expect(pontosNivelGmv(6, 0, { ...CONFIG_PADRAO, peso_nivel_gmv: 70 })).toBe(62);
  });
});

describe("Creators: categoria (T-003)", () => {
  const prod = { ids: ["604206", "859912", "866056"], nivel1Id: "604206", nivel1Nome: "Brinquedos e hobbies" };
  it("igual: mesma categoria de 1º nível ou id em comum", () => {
    expect(pontosCategoria(prod, [{ id: "866056", nivel1Id: "604206", nivel1Nome: "Brinquedos e hobbies" }]).pontos).toBe(15);
    expect(pontosCategoria(prod, [{ id: "999", nivel1Id: "604206", nivel1Nome: "Brinquedos e hobbies" }]).motivo).toBe("igual");
  });
  it("vizinha: brinquedos ↔ bebê/moda infantil; casa ↔ cozinha/móveis", () => {
    expect(pontosCategoria(prod, [{ id: "1", nivel1Id: "602284", nivel1Nome: "Bebê e maternidade" }]).pontos).toBe(8);
    const casa = { ids: ["600001"], nivel1Id: "600001", nivel1Nome: "Casa e cozinha" };
    expect(pontosCategoria(casa, [{ id: "2", nivel1Id: "600942", nivel1Nome: "Móveis" }]).motivo).toBe("vizinha");
  });
  it("outra: 3; desconhecida (sem dado): 5, não zera", () => {
    expect(pontosCategoria(prod, [{ id: "3", nivel1Id: "601152", nivel1Nome: "Moda feminina" }]).pontos).toBe(3);
    expect(pontosCategoria(null, [{ id: "3", nivel1Id: "601152", nivel1Nome: "Moda feminina" }]).pontos).toBe(5);
    expect(pontosCategoria(prod, []).pontos).toBe(5);
    expect(pontosCategoria(prod, [{ id: "603014", nivel1Id: null, nivel1Nome: null }]).motivo).toBe("desconhecida");
  });
});

describe("Creators: nota do criador (0–100)", () => {
  const prod = { ids: ["604206"], nivel1Id: "604206", nivel1Nome: "Brinquedos e hobbies" };
  const forte = { nivel: 7, gmv: 50000, taxa_cumprimento: 100, categorias: [{ id: "x", nivel1Id: "604206", nivel1Nome: "Brinquedos e hobbies" }], ja_vendeu_para_loja: true, media_views_video: 50000 };
  const fraco = { nivel: 1, gmv: 0, taxa_cumprimento: 0, categorias: [{ id: "y", nivel1Id: "601152", nivel1Nome: "Moda feminina" }], ja_vendeu_para_loja: false, media_views_video: 0 };
  it("máximo 100 (os pesos somam 100; bônus de parado fica limitado)", () => {
    expect(notaCriador(forte, prod, true).nota).toBe(100);
    expect(notaCriador(forte, prod, false).nota).toBe(100);
    expect(notaCriador(fraco, prod, false).nota).toBe(3); // só "outra" categoria
  });
  it("criador sem perfil ainda (nível ?, categoria desconhecida) não zera: GMV da amostra + desconhecida", () => {
    const semPerfil = { nivel: null, gmv: 565846, taxa_cumprimento: 93.82, categorias: [], ja_vendeu_para_loja: false, media_views_video: 659 };
    const r = notaCriador(semPerfil, prod, false);
    expect(r.motivos.nivel_gmv).toBe(35);
    expect(r.motivos.categoria).toBe(5);
    expect(r.nota).toBe(35 + 19 + 5 + 0 + 9); // views 659 → 9/15 (escala logarítmica até 50 mil)
  });
});

describe("Creators: sugestão por pedido de amostra (T-003)", () => {
  it("aprovar: nota >= 70; >= 50 com custo <= 40; ou parado com nota >= 60 e custo <= 600", () => {
    expect(sugestaoAmostra(75, 700)).toBe("aprovar");
    expect(sugestaoAmostra(55, 30)).toBe("aprovar");
    expect(sugestaoAmostra(62, 575, CONFIG_PADRAO, true)).toBe("aprovar"); // aparelho de jantar parado
    expect(sugestaoAmostra(62, 575, CONFIG_PADRAO, false)).toBe("decidir");
    expect(sugestaoAmostra(62, 700, CONFIG_PADRAO, true)).toBe("decidir");
  });
  it("recusar: nota < 30 com custo > 40; o resto decide", () => {
    expect(sugestaoAmostra(20, 50)).toBe("recusar");
    expect(sugestaoAmostra(20, 30)).toBe("decidir");
    expect(sugestaoAmostra(20, null)).toBe("decidir");
  });
  it("frete por faixa de peso e custo da amostra", () => {
    expect(freteEstimado(3.5)).toEqual({ frete: 25, semPeso: false });
    expect(freteEstimado(null)).toEqual({ frete: 25, semPeso: true });
    expect(custoAmostra(28, CONFIG_PADRAO, 0.5)).toBe(40);
    expect(custoAmostra(null)).toBeNull();
  });
});
