import { supabase } from "@/lib/supabase";
import { chamarComBackoff } from "@/lib/tiktok/creators";
import type { LojaTikTok } from "@/lib/tiktok/lojas";

// Detalhe do produto do TikTok (GET /product/202309/products/{id}): o products/search NÃO traz
// category_chains nem package_weight (conferido 16/11/2026). Guarda cadeia de categorias, 1º nível
// e peso em tiktok_produtos e alimenta tiktok_categorias (id → pai → 1º nível).
type J = Record<string, unknown>;

export async function coletarDetalheProdutosTikTok(loja: LojaTikTok, opts: { max?: number; orcamentoMs?: number } = {}): Promise<{ detalhes: number; erros: number; erro?: string }> {
  const inicio = Date.now();
  const limite = new Date(Date.now() - 7 * 86400000).toISOString();
  // prioridade: produtos com pedido de amostra pendente; depois os sem detalhe ou com detalhe velho
  const { data: comPedido } = await supabase.from("tiktok_amostras").select("produto_id").eq("loja_id", loja.lojaId).eq("status", "PENDING").not("produto_id", "is", null);
  const prio = new Set((comPedido || []).map((a) => a.produto_id as string));
  const { data: prods } = await supabase.from("tiktok_produtos").select("produto_id, detalhe_em").eq("loja_id", loja.lojaId).or(`detalhe_em.is.null,detalhe_em.lt.${limite}`).limit(500);
  const fila = (prods || []).sort((a, b) => Number(prio.has(b.produto_id)) - Number(prio.has(a.produto_id))).slice(0, opts.max ?? 40);
  let detalhes = 0;
  let erros = 0;
  const categorias = new Map<string, J>();
  try {
    for (const p of fila) {
      if (opts.orcamentoMs && Date.now() - inicio > opts.orcamentoMs) break;
      const r = await chamarComBackoff(loja, `/product/202309/products/${encodeURIComponent(p.produto_id)}`, {}, "creators_produtos");
      if (Number(r.code) !== 0) {
        erros++;
        await supabase.from("tiktok_produtos").update({ detalhe_em: new Date().toISOString() }).eq("loja_id", loja.lojaId).eq("produto_id", p.produto_id);
        continue;
      }
      const d = (r.data as J) || {};
      const cadeia = Array.isArray(d.category_chains) ? (d.category_chains as J[]) : [];
      const raiz = cadeia.find((c) => String(c.parent_id ?? "0") === "0") || cadeia[0];
      const folha = cadeia.find((c) => c.is_leaf === true) || cadeia[cadeia.length - 1];
      const pw = (d.package_weight as J) || {};
      const pesoBruto = Number(pw.value ?? 0);
      const pesoKg = pesoBruto > 0 ? (String(pw.unit ?? "KILOGRAM").toUpperCase().startsWith("G") ? pesoBruto / 1000 : pesoBruto) : null;
      await supabase
        .from("tiktok_produtos")
        .update({
          nome: String(d.title ?? "").slice(0, 200) || undefined,
          categoria_id: folha ? String(folha.id ?? "") || null : null,
          categoria_nome: folha ? String(folha.local_name ?? "") || null : null,
          categoria_nivel1_id: raiz ? String(raiz.id ?? "") || null : null,
          categoria_nivel1_nome: raiz ? String(raiz.local_name ?? "") || null : null,
          categoria_cadeia: cadeia.map((c) => ({ id: String(c.id), nome: c.local_name ?? null, parent_id: c.parent_id ?? null })),
          peso_kg: pesoKg,
          detalhe_em: new Date().toISOString(),
        })
        .eq("loja_id", loja.lojaId)
        .eq("produto_id", p.produto_id);
      for (const c of cadeia) categorias.set(String(c.id), { id: String(c.id), parent_id: String(c.parent_id ?? "0"), nome: String(c.local_name ?? ""), nivel1_id: raiz ? String(raiz.id) : null, nivel1_nome: raiz ? String(raiz.local_name ?? "") : null, atualizado_em: new Date().toISOString() });
      detalhes++;
    }
    if (categorias.size) await supabase.from("tiktok_categorias").upsert([...categorias.values()], { onConflict: "id" });
    return { detalhes, erros };
  } catch (e) {
    return { detalhes, erros, erro: e instanceof Error ? e.message : String(e) };
  }
}

// Árvore completa de categorias (GET /product/202309/categories): só quando a API responder com itens.
export async function coletarArvoreCategoriasTikTok(loja: LojaTikTok): Promise<number> {
  const r = await chamarComBackoff(loja, "/product/202309/categories", { query: { locale: "pt-BR", category_version: "v2" } }, "creators_produtos").catch(() => null);
  const lista = ((r?.data as J)?.categories as J[]) || [];
  if (!lista.length) return 0;
  const porId = new Map(lista.map((c) => [String(c.id), c]));
  const nivel1 = (id: string): J | null => {
    let atual = porId.get(id) || null;
    for (let i = 0; i < 10 && atual && String(atual.parent_id ?? "0") !== "0"; i++) atual = porId.get(String(atual.parent_id)) || null;
    return atual;
  };
  const linhas = lista.map((c) => {
    const n1 = nivel1(String(c.id));
    return { id: String(c.id), parent_id: String(c.parent_id ?? "0"), nome: String(c.local_name ?? ""), nivel1_id: n1 ? String(n1.id) : null, nivel1_nome: n1 ? String(n1.local_name ?? "") : null, atualizado_em: new Date().toISOString() };
  });
  for (let i = 0; i < linhas.length; i += 500) await supabase.from("tiktok_categorias").upsert(linhas.slice(i, i + 500), { onConflict: "id" });
  return linhas.length;
}
