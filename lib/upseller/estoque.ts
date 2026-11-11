import { supabase } from "@/lib/supabase";
import { listarArmazens, listarSkusArmazem, upsellerConfigurado } from "@/lib/upseller/cliente";

// D1 — coleta do estoque do UpSeller → estoque_armazem (estado atual) + estoque_historico (foto do dia).
export async function coletarEstoqueUpseller(): Promise<{ armazens: number; skus: number; erro?: string }> {
  const cfg = upsellerConfigurado();
  if (!cfg.mcp && !cfg.rest) return { armazens: 0, skus: 0, erro: "UpSeller não configurado (UPSELLER_MCP_TOKEN ou UPSELLER_CLIENT_ID + UPSELLER_API_TOKEN)." };
  const armazens = await listarArmazens();
  const dia = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  let skus = 0;
  for (const a of armazens) {
    const lista = await listarSkusArmazem(a.id);
    const agora = new Date().toISOString();
    const linhas = lista.map((s) => ({ armazem_id: a.id, armazem_nome: a.nome, sku: s.sku, disponivel: s.disponivel, ocupado: s.ocupado, em_transito: s.em_transito, atual: s.atual || s.disponivel + s.ocupado, custo_medio: s.custo_medio, bruto: s.bruto, coletado_em: agora }));
    for (let i = 0; i < linhas.length; i += 500) await supabase.from("estoque_armazem").upsert(linhas.slice(i, i + 500), { onConflict: "armazem_id,sku" });
    const foto = linhas.map((l) => ({ dia, armazem_id: l.armazem_id, sku: l.sku, disponivel: l.disponivel, atual: l.atual, custo_medio: l.custo_medio }));
    for (let i = 0; i < foto.length; i += 500) await supabase.from("estoque_historico").upsert(foto.slice(i, i + 500), { onConflict: "dia,armazem_id,sku" });
    // catálogo: cria o SKU se ainda não existe (nome e custo do UpSeller)
    const cat = lista.filter((s) => s.sku).map((s) => ({ sku: s.sku, nome: s.nome ?? null, custo: s.custo_medio, tipo: String(s.bruto.skuType || "").toUpperCase() === "KIT" || s.bruto.isGroup === 1 ? "kit" : "unico" }));
    for (let i = 0; i < cat.length; i += 500) {
      const bloco = cat.slice(i, i + 500);
      const { data: existentes } = await supabase.from("catalogo_sku").select("sku").in("sku", bloco.map((c) => c.sku));
      const ja = new Set((existentes || []).map((e) => e.sku));
      const novos = bloco.filter((c) => !ja.has(c.sku));
      if (novos.length) await supabase.from("catalogo_sku").insert(novos);
      // custo médio atualiza sempre (fonte: UpSeller)
      for (const c of bloco.filter((c) => ja.has(c.sku) && c.custo != null)) await supabase.from("catalogo_sku").update({ custo: c.custo, tipo: c.tipo, atualizado_em: new Date().toISOString() }).eq("sku", c.sku);
    }
    skus += lista.length;
  }
  return { armazens: armazens.length, skus };
}
