// Conferência "tela × banco" de Estoque e Finanças. Pulado sem acesso ao banco.
// Só consultas ao banco (as libs de tela importam lib/supabase, que é server-only).
import { describe, expect, it } from "vitest";
import { banco, rpc, temBanco, janelaFechada } from "./banco";

const iso = (d: Date) => d.toISOString().slice(0, 10);

describe.skipIf(!temBanco())("Estoque × banco", () => {
  it("os 20 SKUs mais vendidos em 30 d chegam ao armazém (balança, malas, panelas incluídas)", async () => {
    const hoje = new Date();
    const { data } = await banco().rpc("vendas_por_sku_armazem", { p_inicio: iso(new Date(hoje.getTime() - 30 * 86400000)), p_fim: iso(new Date(hoje.getTime() + 86400000)), p_loja_ids: null });
    const vendas = ((data || []) as { sku_armazem: string; qtd: number }[]).sort((a, b) => Number(b.qtd) - Number(a.qtd));
    expect(vendas.length).toBeGreaterThan(0);
    const top = vendas.slice(0, 20).map((v) => v.sku_armazem);
    const { data: est } = await banco().from("estoque_armazem").select("sku").in("sku", top);
    const { data: cat } = await banco().from("catalogo_sku").select("sku").in("sku", top);
    const conhecidos = new Set([...(est || []).map((e) => e.sku), ...(cat || []).map((c) => c.sku)]);
    for (const sku of top) expect(conhecidos.has(sku), `SKU ${sku} vende muito mas não existe no armazém/catálogo (mapear no UpSeller)`).toBe(true);
  });

  it("item_sku entra quando model_sku é vazio: quase nenhuma linha de item sem SKU", async () => {
    const { count: total } = await banco().from("pedido_itens").select("*", { count: "exact", head: true }).gte("dia", iso(new Date(Date.now() - 30 * 86400000)));
    const { count: vazio } = await banco().from("pedido_itens").select("*", { count: "exact", head: true }).gte("dia", iso(new Date(Date.now() - 30 * 86400000))).eq("model_sku", "");
    if (!total) return;
    expect((vazio || 0) / total, `${vazio} de ${total} itens sem SKU`).toBeLessThan(0.01);
  });

  it("SKU de anúncio sem ligação com o armazém não pode ter estoque físico (iria para ruptura à toa)", async () => {
    const { data: sem } = await banco().rpc("anuncios_sem_mapeamento", { p_dias: 30, p_loja_ids: null });
    const skus = [...new Set(((sem || []) as { model_sku: string }[]).map((s) => s.model_sku))].slice(0, 500);
    if (!skus.length) return;
    const { data: est } = await banco().from("estoque_armazem").select("sku").in("sku", skus);
    expect(est || []).toHaveLength(0);
  });
});

describe.skipIf(!temBanco())("Finanças × banco", () => {
  it("vendas por UF: a UF é o destino (PR não pode ser a maioria absoluta das vendas nacionais)", async () => {
    const { inicio, fim } = janelaFechada(30);
    const r = await rpc<{ por_uf: { uf: string; pedidos: number }[] }>("resumo_financas", { p_loja_ids: null, p_inicio: inicio, p_fim: fim, p_conta: null });
    const comUf = r.por_uf.filter((u) => u.uf && u.uf !== "—");
    if (comUf.length === 0) return;
    const totalComUf = comUf.reduce((s, u) => s + Number(u.pedidos), 0);
    const maior = [...comUf].sort((a, b) => Number(b.pedidos) - Number(a.pedidos))[0];
    // antes da correção (12/11/2026) PR tinha 4.742 de ~8.400 pedidos com UF: era o hub de origem
    expect(Number(maior.pedidos) / totalComUf, `UF ${maior.uf} concentra demais`).toBeLessThan(0.5);
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
