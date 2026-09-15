import { supabase } from "@/lib/supabase";
import { chamar } from "@/lib/shopee/adsColetor";
import type { LojaShopee } from "@/lib/shopee/lojas";

// Sincroniza as variações (models) dos produtos ativos de uma loja via
// /api/v2/product/get_model_list (1 chamada por produto). Pega primeiro os
// produtos nunca sincronizados / mais antigos (produtos.variacoes_em).
type Row = Record<string, unknown>;
const n = (v: unknown) => Number(v || 0);

export type ResultadoVariacoes = { lojaId: string; produtos: number; variacoes: number; erros: number; restantes: number; erro?: string };

export async function sincronizarVariacoesLoja({ loja, limite = 150 }: { loja: LojaShopee; limite?: number }): Promise<ResultadoVariacoes> {
  const tok = { at: loja.accessToken, shop: loja.shopId };
  const { data: prodRaw } = await supabase
    .from("produtos")
    .select("id, item_id, variacoes_em")
    .eq("marketplace", "shopee")
    .eq("loja_id", loja.lojaId)
    .eq("status", "NORMAL")
    .not("item_id", "is", null)
    .order("variacoes_em", { ascending: true, nullsFirst: true })
    .limit(limite);
  const produtos = (prodRaw as { id: string; item_id: string; variacoes_em: string | null }[]) || [];
  const { count } = await supabase
    .from("produtos").select("id", { count: "exact", head: true })
    .eq("marketplace", "shopee").eq("loja_id", loja.lojaId).eq("status", "NORMAL");

  let variacoes = 0, erros = 0;
  for (const p of produtos) {
    const r = await chamar("/api/v2/product/get_model_list", tok, `&item_id=${p.item_id}`);
    if (r.error) {
      erros++;
      // produto que a API não reconhece mais: marca como visto pra não travar a fila
      await supabase.from("produtos").update({ variacoes_em: new Date().toISOString() }).eq("id", p.id);
      continue;
    }
    const resp = (r.response as Row) || {};
    const tiers = ((resp.tier_variation as Row[]) || []).map((t) => ({
      name: String(t.name || ""),
      options: (((t.option_list as Row[]) || []).map((o) => String(o.option || ""))),
    }));
    const models = (resp.model as Row[]) || [];
    const linhas = models.map((m) => {
      const idx = (m.tier_index as number[]) || [];
      const nome = idx.map((ti, i) => tiers[i]?.options?.[ti]).filter(Boolean).join(" / ");
      const price = ((m.price_info as Row[]) || [])[0] || {};
      const stock = (m.stock_info_v2 as Row) || {};
      const summary = (stock.summary_info as Row) || {};
      const sellerStock = ((stock.seller_stock as Row[]) || []).reduce((s, x) => s + n(x.stock), 0);
      return {
        loja_id: loja.lojaId,
        item_id: p.item_id,
        model_id: n(m.model_id),
        model_sku: String(m.model_sku || "").trim(),
        nome,
        preco: price.current_price != null ? n(price.current_price) : null,
        estoque: summary.total_available_stock != null ? n(summary.total_available_stock) : sellerStock,
        status: String(m.model_status || ""),
        atualizado_em: new Date().toISOString(),
      };
    });
    if (linhas.length) {
      await supabase.from("produto_variacoes").upsert(linhas, { onConflict: "loja_id,item_id,model_id" });
      // modelos que sumiram do produto
      await supabase.from("produto_variacoes").delete()
        .eq("loja_id", loja.lojaId).eq("item_id", p.item_id)
        .not("model_id", "in", `(${linhas.map((l) => l.model_id).join(",")})`);
    } else {
      await supabase.from("produto_variacoes").delete().eq("loja_id", loja.lojaId).eq("item_id", p.item_id);
    }
    variacoes += linhas.length;
    await supabase.from("produtos").update({ variacoes_em: new Date().toISOString() }).eq("id", p.id);
    await new Promise((ok) => setTimeout(ok, 150));
  }
  return { lojaId: loja.lojaId, produtos: produtos.length, variacoes, erros, restantes: Math.max(0, (count || 0) - produtos.length) };
}
