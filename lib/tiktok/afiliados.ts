import { supabase } from "@/lib/supabase";
import { chamarTikTok } from "@/lib/tiktok/client";
import type { LojaTikTok } from "@/lib/tiktok/lojas";

// E2 — TikTok afiliados: pedidos (POST /affiliate_seller/202410/orders/search) → tiktok_afiliado_pedidos.
// O criador (GET /affiliate_seller/202608/marketplace_creators/{id}) exige região do criador igual à
// da loja (erro 16901006 na sondagem); o cache semanal só grava quando a API responder.
type J = Record<string, unknown>;
const n = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v) || 0);
const money = (v: unknown) => n((v as J)?.amount);
const str = (v: unknown) => (v === null || v === undefined ? null : String(v));

export function mapearPedidoAfiliado(o: J, lojaId: string) {
  const skus = Array.isArray(o.skus) ? (o.skus as J[]) : [];
  return skus.map((s) => ({
    loja_id: lojaId,
    order_id: String(o.id),
    sku_id: String(s.sku_id ?? s.id ?? ""),
    criador_usuario: str(s.creator_username),
    criador_id: str(s.creator_id),
    conteudo_tipo: str(s.content_type),
    conteudo_id: str(s.content_id),
    modelo_comissao: str(s.commission_model),
    taxa_comissao: s.commission_rate !== undefined ? Number(s.commission_rate) / 100 : null, // "800" = 8,00 %
    comissao_estimada: money(s.estimated_paid_commission) ?? money(s.estimated_commission),
    comissao_paga: money(s.actual_paid_commission),
    base_comissao: money(s.estimated_commission_base) ?? money(s.actual_commission_base),
    status_liquidacao: str(s.settlement_status) ?? str(o.settlement_status) ?? str(s.status),
    campanha_id: str(s.campaign_id) || null,
    criado_em: o.create_time ? new Date(Number(o.create_time) * 1000).toISOString() : null,
    entregue_em: Number(o.delivery_time) > 0 ? new Date(Number(o.delivery_time) * 1000).toISOString() : null,
    bruto: { ...o, skus: [s] },
    coletado_em: new Date().toISOString(),
  }));
}

export async function coletarPedidosAfiliadosTikTok(loja: LojaTikTok, desdeUnix: number): Promise<{ pedidos: number; linhas: number; erro?: string }> {
  let token = "";
  let pedidos = 0;
  let linhas = 0;
  try {
    for (let i = 0; i < 40; i++) {
      const r = await chamarTikTok("/affiliate_seller/202410/orders/search", {
        method: "POST",
        accessToken: loja.accessToken,
        shopCipher: loja.shopCipher,
        query: { page_size: "50", ...(token ? { page_token: token } : {}) },
        body: { create_time_ge: desdeUnix },
      });
      if (r.code !== 0) throw new Error(`orders/search: ${r.code} ${r.message}`);
      const orders = (r.data?.orders as J[]) || [];
      const lote = orders.flatMap((o) => mapearPedidoAfiliado(o, loja.lojaId)).filter((l) => l.sku_id);
      if (lote.length) await supabase.from("tiktok_afiliado_pedidos").upsert(lote, { onConflict: "loja_id,order_id,sku_id" });
      pedidos += orders.length;
      linhas += lote.length;
      token = r.data?.next_page_token || "";
      if (!token) break;
    }
    return { pedidos, linhas };
  } catch (e) {
    return { pedidos, linhas, erro: e instanceof Error ? e.message : String(e) };
  }
}

export async function atualizarCriadorTikTok(loja: LojaTikTok, criadorId: string): Promise<boolean> {
  const { data: cache } = await supabase.from("tiktok_criadores").select("coletado_em").eq("criador_id", criadorId).maybeSingle();
  if (cache && Date.now() - new Date(cache.coletado_em).getTime() < 7 * 86400000) return true;
  const r = await chamarTikTok(`/affiliate_seller/202608/marketplace_creators/${encodeURIComponent(criadorId)}`, { accessToken: loja.accessToken, shopCipher: loja.shopCipher });
  if (r.code !== 0) return false;
  const c = (r.data?.creator as J) || (r.data as J) || {};
  const perf = (c.performance as J) || {};
  await supabase.from("tiktok_criadores").upsert({ criador_id: criadorId, usuario: str(c.username ?? c.user_name), nome: str(c.nickname ?? c.nick_name), seguidores: n(c.follower_count ?? c.followers), gmv: money(perf.gmv), gmv_video: money(perf.video_gmv), gmv_live: money(perf.live_gmv), bruto: r.data, coletado_em: new Date().toISOString() });
  return true;
}
