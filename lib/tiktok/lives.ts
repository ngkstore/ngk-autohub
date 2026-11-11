import { supabase } from "@/lib/supabase";
import { chamarTikTok } from "@/lib/tiktok/client";
import type { LojaTikTok } from "@/lib/tiktok/lojas";

// E1 — TikTok: lives, vídeos e produtos por canal (API de analytics; sondada em 11/11/2026).
//  - lives: GET /analytics/202609/shop_lives/performance?account_type=OFFICIAL_ACCOUNTS|AFFILIATE_ACCOUNTS
//    (a conta oficial da loja e as lives de afiliados; "ALL" não é aceito)
//  - produtos da live: GET /analytics/202512/shop/{live_id}/products_performance
//  - minuto a minuto (/202510/.../performance_per_minutes): PERMISSÃO NEGADA para o app — não coleta
//  - vídeos: GET /analytics/202605/shop_videos/performance
//  - produtos por canal: GET /analytics/202605/shop_products/performance
//  - loja por hora: GET /analytics/202510/shop/performance/{date}/performance_per_hour
type J = Record<string, unknown>;
const n = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v) || 0);
const money = (v: unknown) => n((v as J)?.amount);
const str = (v: unknown) => (v === null || v === undefined ? null : String(v));
const ymd = (d: Date) => d.toISOString().slice(0, 10);
export const TIPOS_CONTA = ["OFFICIAL_ACCOUNTS", "AFFILIATE_ACCOUNTS"] as const;

export function mapearLive(s: J, lojaId: string, tipoConta: string) {
  const c = (s.creator as J) || {};
  const sp = (s.sales_performance as J) || {};
  const ip = (s.interaction_performance as J) || {};
  const ep = (s.engagement_performance as J) || (s.traffic_performance as J) || {};
  const inicio = str(s.start_time);
  const fim = str(s.end_time);
  const dur = inicio && fim ? Math.max(0, Math.round((new Date(fim.replace(" ", "T") + "Z").getTime() - new Date(inicio.replace(" ", "T") + "Z").getTime()) / 1000)) : n(s.duration);
  const receita = money(sp.live_attributed_gmv) ?? money(sp.live_gmv) ?? 0;
  return {
    canal: "tiktok" as const,
    loja_id: lojaId,
    live_id: String(s.id),
    origem: "api" as const,
    tipo_conta: tipoConta,
    criador_nome: str(c.nick_name),
    criador_usuario: str(c.user_name),
    criador_id: str(c.open_id) || str(c.creator_id),
    inicio: inicio ? new Date(inicio.replace(" ", "T") + "Z").toISOString() : null,
    fim: fim ? new Date(fim.replace(" ", "T") + "Z").toISOString() : null,
    duracao_s: dur,
    receita,
    pedidos: n(sp.live_attributed_sku_orders) ?? n(sp.created_sku_orders) ?? 0,
    itens: n(sp.live_attributed_items_sold) ?? 0,
    espectadores: n(ep.viewers) ?? n(ep.unique_viewers) ?? n(s.viewers),
    pico: n(ep.peak_viewers) ?? n(ep.max_viewers) ?? n(s.peak_viewers),
    tempo_medio_s: n(ep.avg_watch_duration) ?? n(ep.avg_viewing_duration),
    ctr: n(ep.product_click_rate) ?? n(ep.ctr) ?? n(sp.ctr),
    likes: n(ip.likes),
    comentarios: n(ip.comments),
    compartilhamentos: n(ip.shares),
    novos_seguidores: n(ip.new_followers),
    receita_por_hora: dur && dur > 0 ? Math.round((receita / (dur / 3600)) * 100) / 100 : null,
    bruto: s,
    coletado_em: new Date().toISOString(),
  };
}

export function mapearVideo(v: J, lojaId: string, janela: { ini: string; fim: string }) {
  const c = (v.creator as J) || {};
  return {
    canal: "tiktok",
    loja_id: lojaId,
    video_id: String(v.id),
    criador_nome: str(c.nick_name),
    criador_usuario: str(c.user_name),
    criador_tipo: str(c.author_type),
    publicado_em: v.post_time ? new Date(Number(v.post_time) * 1000).toISOString() : v.video_post_time ? new Date(String(v.video_post_time).replace(" ", "T") + "Z").toISOString() : null,
    duracao_s: n(v.duration),
    views: n(v.views) ?? n(v.video_views),
    likes: n(v.likes),
    comentarios: n(v.comments),
    compartilhamentos: n(v.shares),
    gmv: money(v.gmv) ?? 0,
    gmv_atribuido: money(v.attributed_gmv) ?? 0,
    gmv_indireto: money(v.indirect_gmv) ?? 0,
    pedidos: n(v.sku_orders) ?? n(v.orders),
    itens: n(v.items_sold),
    ctr: n(v.click_through_rate) ?? n(v.ctr),
    gpm: money(v.gpm),
    janela_ini: janela.ini,
    janela_fim: janela.fim,
    bruto: v,
    coletado_em: new Date().toISOString(),
  };
}

export function mapearProdutoCanal(p: J, lojaId: string, janela: { ini: string; fim: string }) {
  const aff = (p.affiliate_total_performance as J) || {};
  const affLive = (p.affiliate_live_performance as J) || {};
  const affVideo = (p.affiliate_video_performance as J) || {};
  const seller = (p.seller_performance as J) || (p.shop_performance as J) || {};
  const showcase = (p.showcase_performance as J) || (p.affiliate_showcase_performance as J) || {};
  return {
    loja_id: lojaId,
    janela_ini: janela.ini,
    janela_fim: janela.fim,
    produto_id: String(p.id ?? p.product_id),
    nome: str(p.name ?? p.product_name),
    gmv_vendedor: money(seller.attributed_gmv) ?? money(seller.gmv) ?? 0,
    gmv_afiliado: money(aff.attributed_gmv) ?? 0,
    gmv_vitrine: money(showcase.attributed_gmv) ?? money(showcase.showcase_attributed_gmv) ?? 0,
    gmv_live_afiliado: money(affLive.live_attributed_gmv) ?? 0,
    gmv_video_afiliado: money(affVideo.video_attributed_gmv) ?? money(affVideo.attributed_gmv) ?? 0,
    pedidos_afiliado: n(aff.attributed_orders),
    bruto: p,
    coletado_em: new Date().toISOString(),
  };
}

async function paginar(loja: LojaTikTok, path: string, query: Record<string, string>, chave: string, max = 20): Promise<J[]> {
  const todos: J[] = [];
  let token = "";
  for (let i = 0; i < max; i++) {
    const r = await chamarTikTok(path, { accessToken: loja.accessToken, shopCipher: loja.shopCipher, query: { page_size: "100", ...query, ...(token ? { page_token: token } : {}) } });
    if (r.code !== 0) throw new Error(`${path}: ${r.code} ${r.message}`);
    todos.push(...((r.data?.[chave] as J[]) || []));
    token = r.data?.next_page_token || "";
    if (!token) break;
  }
  return todos;
}

export async function coletarLivesTikTok(loja: LojaTikTok, dias = 7): Promise<{ lives: number; produtos: number; erros: string[] }> {
  const fim = new Date();
  const ini = new Date(fim.getTime() - dias * 86400000);
  const janela = { start_date_ge: ymd(ini), end_date_lt: ymd(new Date(fim.getTime() + 86400000)) };
  let lives = 0;
  let produtos = 0;
  const erros: string[] = [];
  for (const tipo of TIPOS_CONTA) {
    try {
      const sessoes = await paginar(loja, "/analytics/202609/shop_lives/performance", { ...janela, account_type: tipo }, "live_stream_sessions");
      for (const s of sessoes) {
        const linha = mapearLive(s, loja.lojaId, tipo);
        const { data: salvo, error } = await supabase.from("lives").upsert(linha, { onConflict: "canal,live_id" }).select("id").single();
        if (error || !salvo) {
          erros.push(`live ${linha.live_id}: ${error?.message}`);
          continue;
        }
        lives++;
        if (!(linha.receita > 0)) continue; // produtos só nas lives que venderam (1.231 lives em 30 d: economiza chamadas)
        try {
          const r = await chamarTikTok(`/analytics/202512/shop/${encodeURIComponent(linha.live_id)}/products_performance`, { accessToken: loja.accessToken, shopCipher: loja.shopCipher, query: { page_size: "100" } });
          const itens = (r.data?.products as J[]) || [];
          if (itens.length) {
            await supabase.from("live_produtos").upsert(
              itens.map((p) => ({ live_uuid: salvo.id, produto_id: String(p.id ?? p.product_id), sku: str(p.sku) ?? str(p.seller_sku), nome: str(p.name ?? p.product_name), receita: money(p.live_attributed_gmv) ?? money(p.gmv) ?? 0, pedidos: n(p.sku_orders) ?? n(p.orders) ?? 0, itens: n(p.items_sold) ?? 0, cliques: n(p.product_clicks), impressoes: n(p.product_impressions), bruto: p })),
              { onConflict: "live_uuid,produto_id" }
            );
            produtos += itens.length;
          }
        } catch (e) {
          erros.push(`produtos da live ${linha.live_id}: ${e instanceof Error ? e.message : e}`);
        }
      }
    } catch (e) {
      erros.push(`${tipo}: ${e instanceof Error ? e.message : e}`);
    }
  }
  return { lives, produtos, erros };
}

export async function coletarVideosTikTok(loja: LojaTikTok, dias = 7): Promise<{ videos: number; erro?: string }> {
  const fim = new Date();
  const ini = new Date(fim.getTime() - dias * 86400000);
  const janela = { ini: ymd(ini), fim: ymd(fim) };
  try {
    const videos = await paginar(loja, "/analytics/202605/shop_videos/performance", { start_date_ge: janela.ini, end_date_lt: ymd(new Date(fim.getTime() + 86400000)), sort_field: "attributed_gmv", sort_order: "DESC" }, "videos", 3);
    const linhas = videos.map((v) => mapearVideo(v, loja.lojaId, janela));
    for (let i = 0; i < linhas.length; i += 500) await supabase.from("videos_desempenho").upsert(linhas.slice(i, i + 500), { onConflict: "canal,video_id" });
    return { videos: linhas.length };
  } catch (e) {
    return { videos: 0, erro: e instanceof Error ? e.message : String(e) };
  }
}

export async function coletarProdutosCanalTikTok(loja: LojaTikTok, dias = 7): Promise<{ produtos: number; erro?: string }> {
  const fim = new Date();
  const ini = new Date(fim.getTime() - dias * 86400000);
  const janela = { ini: ymd(ini), fim: ymd(fim) };
  try {
    const produtos = await paginar(loja, "/analytics/202605/shop_products/performance", { start_date_ge: janela.ini, end_date_lt: ymd(new Date(fim.getTime() + 86400000)) }, "products", 3);
    const linhas = produtos.map((p) => mapearProdutoCanal(p, loja.lojaId, janela));
    for (let i = 0; i < linhas.length; i += 500) await supabase.from("produtos_canal_dia").upsert(linhas.slice(i, i + 500), { onConflict: "loja_id,janela_ini,janela_fim,produto_id" });
    return { produtos: linhas.length };
  } catch (e) {
    return { produtos: 0, erro: e instanceof Error ? e.message : String(e) };
  }
}

// Loja por hora (últimos 30 dias): GMV por hora do dia, para comparar com o horário das lives.
export async function lojaPorHoraTikTok(loja: LojaTikTok, dia: string): Promise<{ hora: number; gmv: number; gmv_live: number; visitantes: number }[]> {
  const r = await chamarTikTok(`/analytics/202510/shop/performance/${dia}/performance_per_hour`, { accessToken: loja.accessToken, shopCipher: loja.shopCipher });
  if (r.code !== 0) return [];
  const intervalos = ((r.data?.performance as J)?.intervals as J[]) || [];
  return intervalos.map((i) => ({ hora: Number(i.index), gmv: money(i.gmv) ?? 0, gmv_live: money(i.live_attributed_gmv) ?? 0, visitantes: n(i.visitors) ?? 0 }));
}
