import { describe, expect, it } from "vitest";
import { comissaoEsperadaItem, faixaComissao } from "@/lib/shopee/comissaoTabela";

const d = (iso: string) => new Date(iso);

describe("comissão esperada por faixa e data (vendedor CNPJ)", () => {
  it("R$ 79,99 em 15/10/2026 -> 20% + R$4,50 = R$ 20,50", () => {
    expect(comissaoEsperadaItem(79.99, d("2026-10-15T12:00:00-03:00"))).toBe(20.5);
  });
  it("R$ 80,00 em 15/10/2026 -> 14% + R$16 = R$ 27,20", () => {
    expect(comissaoEsperadaItem(80, d("2026-10-15T12:00:00-03:00"))).toBe(27.2);
  });
  it("R$ 99,90 em 15/10/2026 -> 14% + R$16 = R$ 29,99", () => {
    expect(comissaoEsperadaItem(99.9, d("2026-10-15T12:00:00-03:00"))).toBe(29.99);
  });
  it("R$ 1.000 em 15/02/2026 -> teto antigo R$ 104", () => {
    expect(comissaoEsperadaItem(1000, d("2026-02-15T12:00:00-03:00"))).toBe(104);
  });
  it("R$ 79,99 em 15/09/2026 ainda usa R$ 4,00 fixos", () => {
    expect(faixaComissao(79.99, d("2026-09-15T12:00:00-03:00")).fixa).toBe(4);
  });
  it("virada para R$ 4,50 em 01/10/2026 00:00 Brasília", () => {
    expect(faixaComissao(50, d("2026-09-30T23:59:59-03:00")).fixa).toBe(4);
    expect(faixaComissao(50, d("2026-10-01T00:00:00-03:00")).fixa).toBe(4.5);
  });
  it("faixas 100–199,99 e 200+", () => {
    expect(comissaoEsperadaItem(150, d("2026-10-15T12:00:00-03:00"))).toBe(41);
    expect(comissaoEsperadaItem(300, d("2026-10-15T12:00:00-03:00"))).toBe(68);
  });
});
