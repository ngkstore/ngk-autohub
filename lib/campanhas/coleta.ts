import { supabase } from "@/lib/supabase";
import { chamarShopee } from "@/lib/shopee/chamar";
import { chamarTikTok } from "@/lib/tiktok/client";
import type { LojaTikTok } from "@/lib/tiktok/lojas";

// F2 — promoções próprias, só leitura (criar/editar pela API fica para depois, com aprovação).
//  Shopee: discount (get_discount_list + get_discount), flash sale (get_shop_flash_sale_list +
//  get_shop_flash_sale_items), voucher (get_voucher_list), bundle deal, add-on deal.
//  TikTok: /promotion/202309/activities/search (page_size no CORPO, int) e activities/{id}.
//  Cupons do TikTok: sem API no Brasil (cadastro manual).
type J = Record<string, unknown>;
const n = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v) || 0);
const str = (v: unknown) => (v === null || v === undefined ? null : String(v));
const unix = (v: unknown) => (Number(v) > 0 ? new Date(Number(v) * 1000).toISOString() : null);
const lista = (resp: J, ...chaves: string[]): J[] => {
  for (const k of chaves) if (Array.isArray(resp[k])) return resp[k] as J[];
  return [];
};

async function gravarCampanha(c: J): Promise<string | null> {
  const { data, error } = await supabase.from("campanhas").upsert({ ...c, atualizado_em: new Date().toISOString() }, { onConflict: "canal,loja_id,plataforma_id" }).select("id").single();
  if (error) return null;
  return data.id as string;
}
async function gravarItens(campanhaId: string, itens: J[]) {
  if (!itens.length) return;
  await supabase.from("campanha_itens").upsert(itens.map((i) => ({ campanha_id: campanhaId, ...i })), { onConflict: "campanha_id,item_id,model_id" });
}

export async function coletarPromocoesShopee(lojaId: string): Promise<{ campanhas: number; itens: number; erros: string[] }> {
  const r = { campanhas: 0, itens: 0, erros: [] as string[] };
  const base = { canal: "shopee", loja_id: lojaId, tipo: "propria", origem: "api" };
  // Descontos
  for (const status of ["upcoming", "ongoing"]) {
    try {
      const l = await chamarShopee<J>({ lojaId, path: "/api/v2/discount/get_discount_list", query: { discount_status: status, page_no: 1, page_size: 100 } });
      if (l.error) throw new Error(`${l.error} ${l.message || ""}`);
      for (const d of lista(l.response || {}, "discount_list")) {
        const id = String(d.discount_id);
        const cid = await gravarCampanha({ ...base, subtipo: "desconto", nome: str(d.discount_name) || `Desconto ${id}`, inicio: unix(d.start_time), fim: unix(d.end_time), status: str(d.status) || status, plataforma_id: id, bruto: d });
        if (!cid) continue;
        r.campanhas++;
        const det = await chamarShopee<J>({ lojaId, path: "/api/v2/discount/get_discount", query: { discount_id: id, page_no: 1, page_size: 100 } });
        const itens: J[] = [];
        for (const it of lista(det.response || {}, "item_list")) {
          const modelos = Array.isArray(it.model_list) && (it.model_list as J[]).length ? (it.model_list as J[]) : [{}];
          for (const m of modelos) itens.push({ item_id: String(it.item_id), model_id: str(m.model_id) || "", sku: str(m.model_sku ?? it.item_sku), nome: str(it.item_name), preco_normal: n(m.model_original_price ?? it.item_original_price), preco_campanha: n(m.model_promotion_price ?? it.item_promotion_price), estoque_promocao: n(m.model_promotion_stock ?? it.item_promotion_stock), bruto: { ...it, model_list: [m] } });
        }
        await gravarItens(cid, itens);
        r.itens += itens.length;
      }
    } catch (e) {
      r.erros.push(`discount ${status}: ${e instanceof Error ? e.message : e}`);
    }
  }
  // Ofertas relâmpago
  try {
    const l = await chamarShopee<J>({ lojaId, path: "/api/v2/shop_flash_sale/get_shop_flash_sale_list", query: { type: 0, offset: 0, limit: 100 } });
    if (l.error) throw new Error(`${l.error} ${l.message || ""}`);
    for (const f of lista(l.response || {}, "flash_sale_list")) {
      const id = String(f.flash_sale_id);
      const cid = await gravarCampanha({ ...base, subtipo: "oferta_relampago", nome: `Oferta relâmpago ${new Date(Number(f.start_time) * 1000).toLocaleDateString("pt-BR")}`, inicio: unix(f.start_time), fim: unix(f.end_time), status: str(f.status), plataforma_id: id, bruto: f });
      if (!cid) continue;
      r.campanhas++;
      const det = await chamarShopee<J>({ lojaId, path: "/api/v2/shop_flash_sale/get_shop_flash_sale_items", query: { flash_sale_id: id, offset: 0, limit: 100 } });
      const itens: J[] = [];
      const infos = new Map(lista(det.response || {}, "item_info").map((i) => [String(i.item_id), i]));
      for (const m of lista(det.response || {}, "models")) {
        const info = infos.get(String(m.item_id)) || {};
        itens.push({ item_id: String(m.item_id), model_id: str(m.model_id) || "", sku: str(m.model_sku ?? info.item_sku), nome: str(info.item_name), preco_normal: n(m.original_price), preco_campanha: n(m.input_promo_price ?? m.promotion_price_with_tax ?? m.campaign_price), estoque_promocao: n(m.campaign_stock ?? m.stock), status: str(m.status), motivo_recusa: str(m.reject_reason ?? m.unqualified_conditions), bruto: m });
      }
      await gravarItens(cid, itens);
      r.itens += itens.length;
    }
  } catch (e) {
    r.erros.push(`flash sale: ${e instanceof Error ? e.message : e}`);
  }
  // Cupons
  for (const status of ["upcoming", "ongoing"]) {
    try {
      const l = await chamarShopee<J>({ lojaId, path: "/api/v2/voucher/get_voucher_list", query: { status, page_no: 1, page_size: 100 } });
      if (l.error) throw new Error(`${l.error} ${l.message || ""}`);
      for (const v of lista(l.response || {}, "voucher_list")) {
        const id = String(v.voucher_id);
        if (await gravarCampanha({ ...base, subtipo: "cupom", nome: `Cupom ${str(v.voucher_name) || str(v.voucher_code) || id}`, inicio: unix(v.start_time), fim: unix(v.end_time), status: str(v.status) || status, plataforma_id: id, desconto_min: n(v.percentage), bruto: v })) r.campanhas++;
      }
    } catch (e) {
      r.erros.push(`voucher ${status}: ${e instanceof Error ? e.message : e}`);
    }
  }
  // Combos e compre junto
  for (const [path, chave, subtipo, idc] of [["/api/v2/bundle_deal/get_bundle_deal_list", "bundle_deal_list", "combo", "bundle_deal_id"], ["/api/v2/add_on_deal/get_add_on_deal_list", "add_on_deal_list", "compre_junto", "add_on_deal_id"]] as const) {
    for (const status of ["upcoming", "ongoing"]) {
      try {
        const l = await chamarShopee<J>({ lojaId, path, query: { [subtipo === "combo" ? "time_status" : "promotion_status"]: status, page_no: 1, page_size: 100 } });
        if (l.error) throw new Error(`${l.error} ${l.message || ""}`);
        for (const b of lista(l.response || {}, chave)) {
          const id = String(b[idc]);
          if (await gravarCampanha({ ...base, subtipo, nome: str(b.name ?? b.add_on_deal_name ?? b.bundle_deal_name) || `${subtipo} ${id}`, inicio: unix(b.start_time), fim: unix(b.end_time), status: str(b.status) || status, plataforma_id: id, bruto: b })) r.campanhas++;
        }
      } catch (e) {
        r.erros.push(`${subtipo} ${status}: ${e instanceof Error ? e.message : e}`);
      }
    }
  }
  return r;
}

export async function coletarAtividadesTikTok(loja: LojaTikTok): Promise<{ campanhas: number; itens: number; erros: string[] }> {
  const r = { campanhas: 0, itens: 0, erros: [] as string[] };
  try {
    let token = "";
    for (let i = 0; i < 10; i++) {
      const l = await chamarTikTok("/promotion/202309/activities/search", { method: "POST", accessToken: loja.accessToken, shopCipher: loja.shopCipher, query: token ? { page_token: token } : {}, body: { page_size: 50 } });
      if (l.code !== 0) throw new Error(`${l.code} ${l.message}`);
      for (const a of (l.data?.activities as J[]) || []) {
        if (String(a.status) === "EXPIRED" && Number(a.end_time) * 1000 < Date.now() - 180 * 86400000) continue; // produtos de atividades encerradas há 180 d não voltam
        const id = String(a.id);
        const cid = await gravarCampanha({ canal: "tiktok", loja_id: loja.lojaId, tipo: "propria", origem: "api", subtipo: String(a.activity_type || "").toLowerCase(), nome: str(a.title) || id, inicio: unix(a.begin_time), fim: unix(a.end_time), status: str(a.status), plataforma_id: id, bruto: a });
        if (!cid) continue;
        r.campanhas++;
        if (String(a.status) === "EXPIRED") continue;
        try {
          const det = await chamarTikTok(`/promotion/202309/activities/${encodeURIComponent(id)}`, { accessToken: loja.accessToken, shopCipher: loja.shopCipher });
          if (det.code !== 0) continue;
          const itens: J[] = [];
          for (const p of (det.data?.products as J[]) || []) {
            const skus = Array.isArray(p.skus) && (p.skus as J[]).length ? (p.skus as J[]) : [{}];
            for (const s of skus) itens.push({ item_id: String(p.id), model_id: str(s.id) || "", sku: null, nome: str(p.title ?? p.name), preco_normal: n(typeof s.original_price === "object" && s.original_price ? (s.original_price as J).amount : s.original_price ?? p.original_price), preco_campanha: n(typeof s.activity_price === "object" && s.activity_price ? (s.activity_price as J).amount : s.activity_price ?? p.activity_price), estoque_promocao: n(s.quantity_limit ?? p.quantity_limit), bruto: { ...p, skus: [s] } });
          }
          await gravarItens(cid, itens);
          r.itens += itens.length;
        } catch (e) {
          r.erros.push(`atividade ${id}: ${e instanceof Error ? e.message : e}`);
        }
      }
      token = l.data?.next_page_token || "";
      if (!token) break;
    }
  } catch (e) {
    r.erros.push(`activities/search: ${e instanceof Error ? e.message : e}`);
  }
  return r;
}
