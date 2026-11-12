import { supabase } from "@/lib/supabase";
import { chamarTikTok } from "@/lib/tiktok/client";
import { lojasTikTokAtivas } from "@/lib/tiktok/lojas";

type J = Record<string, unknown>;

// Estoque dos anúncios do TikTok Shop (POST /product/202309/inventory/search) → produto_variacoes
// (loja TikTok; item_id = product_id, model_id = sku_id, model_sku = seller_sku, estoque = soma dos armazéns).
export async function coletarEstoqueTikTok(): Promise<{ lojas: number; skus: number; erros: string[] }> {
  const lojas = await lojasTikTokAtivas();
  const erros: string[] = [];
  let skus = 0;
  for (const loja of lojas) {
    const agora = new Date().toISOString();
    const linhas: J[] = [];
    let pageToken = "";
    for (let pagina = 0; pagina < 100; pagina++) {
      const query: Record<string, string> = { page_size: "100" };
      if (pageToken) query.page_token = pageToken;
      let resp: J | null = null;
      for (let tent = 0; tent < 4; tent++) {
        resp = (await chamarTikTok("/product/202309/inventory/search", { method: "POST", accessToken: loja.accessToken, shopCipher: loja.shopCipher, query, body: {} })) as J;
        if (Number(resp.code) === 36009002) {
          await new Promise((r) => setTimeout(r, 1500 * (tent + 1)));
          continue;
        }
        break;
      }
      if (!resp || Number(resp.code) !== 0) {
        erros.push(`${loja.lojaId.slice(0, 8)}: ${resp?.code} ${String(resp?.message ?? "")}`);
        break;
      }
      const data = (resp.data as J) || {};
      const inventario = (data.inventory as J[]) || [];
      for (const p of inventario) {
        const itemId = String(p.id ?? p.product_id ?? "");
        if (!itemId) continue;
        for (const s of (p.skus as J[]) || []) {
          const modelId = String(s.id ?? s.sku_id ?? "");
          const estoque = ((s.warehouse_inventory as J[]) || []).reduce((a, w) => a + Number(w.quantity || 0), 0);
          linhas.push({ loja_id: loja.lojaId, item_id: itemId, model_id: modelId || "0", model_sku: String(s.seller_sku ?? "").trim().toUpperCase() || null, estoque, status: "ativo", atualizado_em: agora });
        }
      }
      pageToken = String(data.next_page_token || "");
      if (!pageToken || inventario.length === 0) break;
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
