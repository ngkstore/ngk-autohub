import { describe, expect, it } from "vitest";
import { comissaoTikTok, liquidaEstimadaTikTok, liquidaEstimadaShopee } from "@/lib/financas/estimativa";

// Pedidos TikTok reais já liquidados (extrato de out/2026) para calibrar a estimativa.
describe("líquido estimado de pedido TikTok sem extrato", () => {
  it("comissão: 10 % + R$ 4 abaixo de R$ 50; 6 % + R$ 6 a partir de R$ 50", () => {
    expect(comissaoTikTok(18.9)).toBeCloseTo(5.89, 2); // extrato real: taxa_comissao 5,89
    expect(comissaoTikTok(179.9)).toBeCloseTo(16.79, 2); // extrato real: 16,79
  });
  it("líquido = valor − comissão − serviço 6 % − afiliado − frete médio (bate com o extrato)", () => {
    // pedido 179,90 com afiliado 12,59 e frete 0: extrato real 139,73
    expect(liquidaEstimadaTikTok(179.9, 12.59, 0)).toBeCloseTo(139.73, 1); // o TikTok arredonda cada taxa; difere 1 centavo
    // pedido 18,90 com afiliado 1,51: extrato real 10,37
    expect(liquidaEstimadaTikTok(18.9, 1.51, 0)).toBeCloseTo(10.37, 2);
    expect(liquidaEstimadaTikTok(100, 0, 0.57)).toBeCloseTo(100 - 12 - 6 - 0.57, 2);
  });
  it("nunca devolve zero para um pedido pago (o lucro não pode virar 0 − CMV)", () => {
    for (const v of [9.9, 29.9, 49.99, 50, 99.9, 500]) expect(liquidaEstimadaTikTok(v)).toBeGreaterThan(0);
  });
  it("Shopee sem escrow: razão líquido/bruto da loja", () => {
    expect(liquidaEstimadaShopee(100, 0.759)).toBe(75.9);
    expect(liquidaEstimadaShopee(100, 0)).toBe(72);
  });
});
