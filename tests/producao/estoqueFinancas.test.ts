// Conferência "tela × banco" de Estoque e Finanças. Pulado sem acesso ao banco.
import { describe, expect, it } from "vitest";
import { banco, rpc, temBanco, janelaFechada } from "./banco";
import { montarEstoque } from "@/lib/estoque/consultas";

describe.skipIf(!temBanco())("Estoque × banco", () => {
  it("venda por dia da tela = vendas por SKU do armazém ÷ 30 (balança, malas, panelas incluídas)", async () => {
    const { linhas } = await montarEstoque(null);
    const hoje = new Date();
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    const { data } = await banco().rpc("vendas_por_sku_armazem", { p_inicio: iso(new Date(hoje.getTime() - 30 * 86400000)), p_fim: iso(new Date(hoje.getTime() + 86400000)), p_loja_ids: null });
    const direto = new Map(((data || []) as { sku_armazem: string; qtd: number }[]).map((r) => [r.sku_armazem, Number(r.qtd)]));
    const top = [...direto.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);
    expect(top.length).toBeGreaterThan(0);
    for (const [sku, q30] of top) {
      const l = linhas.find((x) => x.sku === sku);
      expect(l, `SKU ${sku} (${q30} un. em 30 d) não aparece na tela`).toBeDefined();
      expect(l!.v30).toBe(q30);
    }
  });

  it("ruptura só com venda relevante; SKU sem ligação com o armazém fica em 'Sem mapeamento'", async () => {
    const { linhas, temUpseller } = await montarEstoque(null);
    if (!temUpseller) return;
    for (const l of linhas) {
      if (l.status === "ruptura") {
        expect(l.fisico).toBeLessThanOrEqual(0);
        expect(l.v30).toBeGreaterThanOrEqual(1);
      }
      if (l.status === "mapear") expect(l.fisico).toBe(0);
    }
    const { data: sem } = await banco().rpc("anuncios_sem_mapeamento", { p_dias: 30, p_loja_ids: null });
    const skusSemMapa = new Set(((sem || []) as { model_sku: string }[]).map((s) => s.model_sku));
    for (const l of linhas.filter((x) => x.status === "ruptura")) expect(skusSemMapa.has(l.sku), `${l.sku} está em ruptura mas não tem ligação com o armazém`).toBe(false);
  });
});

describe.skipIf(!temBanco())("Finanças × banco", () => {
  it("vendas por UF: a UF é o destino (PR não pode ser a maioria absoluta das vendas nacionais)", async () => {
    const { inicio, fim } = janelaFechada(30);
    const r = await rpc<{ por_uf: { uf: string; pedidos: number }[] }>("resumo_financas", { p_loja_ids: null, p_inicio: inicio, p_fim: fim, p_conta: null });
    const total = r.por_uf.reduce((s, u) => s + Number(u.pedidos), 0);
    const comUf = r.por_uf.filter((u) => u.uf && u.uf !== "—");
    if (total === 0 || comUf.length === 0) return;
    const maior = comUf.sort((a, b) => Number(b.pedidos) - Number(a.pedidos))[0];
    // antes da correção (12/11/2026) PR tinha 4.742 de ~8.400 pedidos com UF: era o hub de origem
    expect(Number(maior.pedidos) / comUf.reduce((s, u) => s + Number(u.pedidos), 0), `UF ${maior.uf} concentra demais`).toBeLessThan(0.5);
  });

  it("imposto do período vem da tabela impostos (conta do admin)", async () => {
    const { data: adm } = await banco().from("conta_membros").select("conta_id").eq("admin", true).limit(1).maybeSingle();
    if (!adm?.conta_id) return;
    const { data: imp } = await banco().from("impostos").select("competencia, valor").eq("conta_id", adm.conta_id);
    for (const i of (imp || []) as { competencia: string; valor: number }[]) {
      const ini = new Date(`${i.competencia}-01T00:00:00-03:00`);
      const fimMes = new Date(ini.getFullYear(), ini.getMonth() + 1, 1);
      const r = await rpc<{ imposto: number }>("resumo_financas", { p_loja_ids: null, p_inicio: ini.toISOString(), p_fim: fimMes.toISOString(), p_conta: adm.conta_id });
      expect(Number(r.imposto), `competência ${i.competencia}`).toBeCloseTo(Number(i.valor), 2);
    }
  });
});
