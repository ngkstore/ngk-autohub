import { describe, expect, it } from "vitest";
import { comissaoTikTok, margemCampanha } from "@/lib/campanhas/margem";

describe("margem no preço da campanha (F3)", () => {
  it("comissão TikTok: 10% + R$ 4 abaixo de R$ 50; 6% + R$ 6 a partir de R$ 50", () => {
    expect(comissaoTikTok(40)).toBe(8);
    expect(comissaoTikTok(49.99)).toBe(9);
    expect(comissaoTikTok(50)).toBe(9);
    expect(comissaoTikTok(100)).toBe(12);
    expect(comissaoTikTok(0)).toBe(0);
  });
  it("Shopee: usa a comissão já calculada pela função SQL", () => {
    // 26,90 → comissão 20% + 4,50 = 9,88 (passada pronta); serviço 2%, afiliado 0, frete 1,20, imposto 10%, custo 11
    const r = margemCampanha({ canal: "shopee", precoCampanha: 26.9, comissaoShopee: 9.88, taxaServicoPct: 2, afiliadoPct: 0, freteMedio: 1.2, impostoPct: 10, custo: 11 });
    expect(r.taxaServico).toBe(0.54);
    expect(r.imposto).toBe(2.69);
    expect(r.margem).toBe(Math.round((26.9 - 9.88 - 0.54 - 0 - 1.2 - 2.69 - 11) * 100) / 100);
    expect(r.pct).toBe(Math.round((r.margem! / 26.9) * 10000) / 100);
    expect(r.avisos).toEqual([]);
  });
  it("TikTok com afiliado 12% fica negativa quando o custo é alto", () => {
    const r = margemCampanha({ canal: "tiktok", precoCampanha: 139.9, taxaServicoPct: 0, afiliadoPct: 12, freteMedio: 16, impostoPct: 8, custo: 110 });
    expect(r.comissao).toBe(14.39);
    expect(r.margem).toBeLessThan(0);
  });
  it("sem custo ou sem comissão Shopee: margem indefinida com aviso", () => {
    expect(margemCampanha({ canal: "shopee", precoCampanha: 50, comissaoShopee: 14.5, taxaServicoPct: 2, afiliadoPct: 0, freteMedio: 0, impostoPct: 0, custo: null }).margem).toBeNull();
    const r = margemCampanha({ canal: "shopee", precoCampanha: 50, comissaoShopee: null, taxaServicoPct: 2, afiliadoPct: 0, freteMedio: 0, impostoPct: 0, custo: 10 });
    expect(r.margem).toBeNull();
    expect(r.avisos).toContain("sem comissão Shopee calculada");
  });
});
