import { supabase } from "@/lib/supabase";
import { chamarTikTok } from "@/lib/tiktok/client";
import { lojasTikTokAtivas } from "@/lib/tiktok/lojas";

type J = Record<string, unknown>;

// Estoque dos anúncios do TikTok Shop → produto_variacoes (loja TikTok; item_id = product_id,
// model_id = sku_id, model_sku = seller_sku, estoque = soma dos armazéns).
// POST /product/202309/products/search lista os produtos com os SKUs e o inventory por armazém;
// /product/202309/inventory/search exige product_ids, então só é usado quando o search vem sem inventory.
export async function coletarEstoqueTikTok(): Promise<{ lojas: number; skus: number; erros: string[] }> {
  const lojas = await lojasTikTokAtivas();
  const erros: string[] = [];
  let skus = 0;
  for (const loja of lojas) {
    const agora = new Date().toISOString();
    const linhas: J[] = [];
    const semInventario: string[] = [];
    let pageToken = "";
    for (let pagina = 0; pagina < 100; pagina++) {
      const query: Record<string, string> = { page_size: "100" };
      if (pageToken) query.page_token = pageToken;
      const resp = await chamarComRetry("/product/202309/products/search", loja, query, { status: "ACTIVATABLE" });
      if (!resp || Number(resp.code) !== 0) {
        erros.push(`${loja.lojaId.slice(0, 8)}: ${resp?.code} ${String(resp?.message ?? "")}`);
        break;
      }
      const data = (resp.data as J) || {};
      const produtos = (data.products as J[]) || [];
      for (const p of produtos) {
        const itemId = String(p.id ?? "");
        if (!itemId) continue;
        const lista = (p.skus as J[]) || [];
        if (!lista.length) continue;
        if (!lista.some((s) => Array.isArray(s.inventory))) semInventario.push(itemId);
        for (const s of lista) {
          const estoque = ((s.inventory as J[]) || []).reduce((a, w) => a + Number(w.quantity || 0), 0);
          linhas.push({ loja_id: loja.lojaId, item_id: itemId, model_id: String(s.id ?? "") || "0", model_sku: String(s.seller_sku ?? "").trim().toUpperCase() || null, nome: String(p.title ?? "").slice(0, 200) || null, estoque, status: String(p.status ?? "ativo").toLowerCase(), atualizado_em: agora });
        }
      }
      pageToken = String(data.next_page_token || "");
      if (!pageToken || produtos.length === 0) break;
    }
    // produtos sem inventory no search: busca em lotes de 100 no inventory/search
    for (let i = 0; i < semInventario.length; i += 100) {
      const resp = await chamarComRetry("/product/202309/inventory/search", loja, {}, { product_ids: semInventario.slice(i, i + 100) });
      if (!resp || Number(resp.code) !== 0) {
        erros.push(`${loja.lojaId.slice(0, 8)} inventory: ${resp?.code} ${String(resp?.message ?? "")}`);
        break;
      }
      for (const p of (((resp.data as J) || {}).inventory as J[]) || []) {
        const itemId = String(p.id ?? p.product_id ?? "");
        for (const s of (p.skus as J[]) || []) {
          const modelId = String(s.id ?? s.sku_id ?? "") || "0";
          const estoque = ((s.warehouse_inventory as J[]) || []).reduce((a, w) => a + Number(w.quantity || 0), 0);
          const l = linhas.find((x) => x.item_id === itemId && x.model_id === modelId);
          if (l) l.estoque = estoque;
        }
      }
    }
    for (let i = 0; i < linhas.length; i += 500) {
      const { error } = await supabase.from("produto_variacoes").upsert(linhas.slice(i, i + 500), { onConflict: "loja_id,item_id,model_id" });
      if (error) {
        erros.push(`${loja.lojaId.slice(0, 8)}: ${error.message}`);
        break;
      }
    }
    skus += linhas.length;
  }
  return { lojas: lojas.length, skus, erros };
}

async function chamarComRetry(path: string, loja: { accessToken: string; shopCipher: string }, query: Record<string, string>, body: unknown): Promise<J | null> {
  let resp: J | null = null;
  for (let tent = 0; tent < 4; tent++) {
    resp = (await chamarTikTok(path, { method: "POST", accessToken: loja.accessToken, shopCipher: loja.shopCipher, query, body })) as J;
    if (Number(resp.code) !== 36009002) break;
    await new Promise((r) => setTimeout(r, 1500 * (tent + 1)));
  }
  return resp;
}
