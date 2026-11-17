import { supabase } from "@/lib/supabase";
import { chamarTikTok } from "@/lib/tiktok/client";
import type { LojaTikTok } from "@/lib/tiktok/lojas";

// Creators (TikTok) — coleta SOMENTE LEITURA: pedidos de amostra, perfil do criador, envios da amostra.
// Fila/backoff próprio: 36009002 (limite de taxa, compartilhado com o cron financeiro) espera e tenta de
// novo; se insistir, grava em tiktok_api_backoff e a rodada para — o cron de 30 min continua depois.
type J = Record<string, unknown>;
const str = (v: unknown) => (v === null || v === undefined || v === "" ? null : String(v));
const num = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));
const money = (v: unknown) => num((v as J)?.amount);
const unixIso = (v: unknown) => (Number(v) > 0 ? new Date(Number(v) * 1000).toISOString() : null);

export class LimiteDeTaxa extends Error {}

async function emBackoff(chave: string): Promise<boolean> {
  const { data } = await supabase.from("tiktok_api_backoff").select("ate").eq("chave", chave).maybeSingle();
  return !!data && new Date(data.ate).getTime() > Date.now();
}
async function marcarBackoff(chave: string, segundos: number, motivo: string) {
  await supabase.from("tiktok_api_backoff").upsert({ chave, ate: new Date(Date.now() + segundos * 1000).toISOString(), motivo, atualizado_em: new Date().toISOString() }, { onConflict: "chave" });
}

// Chamada com espera e nova tentativa no 36009002 (3 tentativas: 2 s, 6 s, 15 s); depois marca backoff de 5 min.
export async function chamarComBackoff(loja: LojaTikTok, path: string, opts: { method?: "GET" | "POST"; query?: Record<string, string>; body?: unknown }, chave = "creators"): Promise<J> {
  if (await emBackoff(chave)) throw new LimiteDeTaxa(`backoff ativo (${chave})`);
  const esperas = [2000, 6000, 15000];
  let r: J = {};
  for (let i = 0; i <= esperas.length; i++) {
    r = (await chamarTikTok(path, { method: opts.method ?? "GET", accessToken: loja.accessToken, shopCipher: loja.shopCipher, query: opts.query, body: opts.body })) as J;
    if (Number(r.code) !== 36009002) return r;
    if (i < esperas.length) await new Promise((res) => setTimeout(res, esperas[i]));
  }
  await marcarBackoff(chave, 300, `36009002 em ${path}`);
  throw new LimiteDeTaxa(`36009002 em ${path}`);
}

export function mapearAmostra(a: J, lojaId: string) {
  const c = (a.creator as J) || {};
  const p = (a.product as J) || {};
  return {
    loja_id: lojaId,
    amostra_id: String(a.id),
    criador_id: str(c.creator_open_id ?? c.creator_id),
    criador_usuario: str(c.username),
    criador_nome: str(c.nickname),
    produto_id: str(p.id),
    produto_nome: str(p.title ?? p.name),
    sku_id: str(p.sku_id),
    sku_nome: str(p.sku_name),
    status: str(a.status),
    is_approvable: a.is_approvable === true,
    pedido_em: unixIso(a.create_time ?? a.apply_time ?? a.request_time),
    expira_em: unixIso(a.approve_expiration_time ?? a.expiration_time),
    order_id: str(a.order_id) && String(a.order_id) !== "0" ? String(a.order_id) : null,
    taxa_comissao: num(a.commission_rate),
    // métricas públicas do criador que vêm junto (em BRL): guardadas no criador
    _criador: { seguidores: num(c.follower_count), gmv: money(c.gmv), gmv_moeda: str((c.gmv as J)?.currency), taxa_cumprimento: num(c.fulfillment_percentage), views_video: num(c.ec_video_view), conteudos: num(c.content_count) },
    bruto: { ...a, creator: { ...c, avatar_url: undefined } },
    atualizado_em: new Date().toISOString(),
  };
}

export async function coletarAmostrasTikTok(loja: LojaTikTok, opts: { orcamentoMs?: number } = {}): Promise<{ amostras: number; paginas: number; erro?: string }> {
  const inicio = Date.now();
  let token = "";
  let amostras = 0;
  let paginas = 0;
  try {
    for (let i = 0; i < 60; i++) {
      if (opts.orcamentoMs && Date.now() - inicio > opts.orcamentoMs) break;
      const r = await chamarComBackoff(loja, "/affiliate_seller/202508/sample_applications/search", { method: "POST", query: { page_size: "50", ...(token ? { page_token: token } : {}) }, body: {} });
      if (Number(r.code) !== 0) throw new Error(`sample_applications/search: ${r.code} ${r.message}`);
      const lista = (((r.data as J) || {}).sample_applications as J[]) || [];
      paginas++;
      const linhas = lista.map((a) => mapearAmostra(a, loja.lojaId));
      const criadores = new Map<string, J>();
      for (const l of linhas) {
        if (!l.criador_id) continue;
        criadores.set(l.criador_id, { criador_id: l.criador_id, usuario: l.criador_usuario, nome: l.criador_nome, seguidores: l._criador.seguidores, gmv: l._criador.gmv, gmv_moeda: l._criador.gmv_moeda, taxa_cumprimento: l._criador.taxa_cumprimento, media_views_video: l._criador.views_video });
      }
      const paraGravar = linhas.map(({ _criador, ...l }) => {
        void _criador;
        return l;
      });
      if (paraGravar.length) {
        const { error } = await supabase.from("tiktok_amostras").upsert(paraGravar, { onConflict: "loja_id,amostra_id" });
        if (error) throw new Error(`tiktok_amostras: ${error.message}`);
      }
      // criador: cria/atualiza só os campos públicos que vieram na amostra (sem apagar o perfil)
      for (const c of criadores.values()) {
        const { data: ja } = await supabase.from("tiktok_criadores").select("criador_id").eq("criador_id", c.criador_id as string).maybeSingle();
        // GMV da amostra vem em BRL → gmv_brl (fonte imediata da nota, sem depender da rodada de perfis)
        const gmvBrl = c.gmv != null && String(c.gmv_moeda ?? "BRL") === "BRL" ? c.gmv : null;
        if (ja) await supabase.from("tiktok_criadores").update({ usuario: c.usuario, nome: c.nome, seguidores: c.seguidores, taxa_cumprimento: c.taxa_cumprimento, media_views_video: c.media_views_video, ...(c.gmv != null ? { gmv: c.gmv, gmv_moeda: c.gmv_moeda } : {}), ...(gmvBrl != null ? { gmv_brl: gmvBrl } : {}) }).eq("criador_id", c.criador_id as string);
        else await supabase.from("tiktok_criadores").insert({ ...c, gmv_brl: gmvBrl, coletado_em: new Date().toISOString() });
      }
      amostras += linhas.length;
      token = String(((r.data as J) || {}).next_page_token || "");
      if (!token) break;
    }
    return { amostras, paginas };
  } catch (e) {
    return { amostras, paginas, erro: e instanceof Error ? e.message : String(e) };
  }
}

export function mapearPerfilCriador(d: J) {
  const c = (d.creator as J) || d;
  const perfil = (c.creator_profile as J) || {};
  // categorias declaradas do criador (category_ids, as que o Affiliate Center mostra) + onde ele vende (category_gmv_distribution)
  const declaradas = Array.isArray(c.category_ids) ? (c.category_ids as unknown[]).map(String) : [];
  const vende = Array.isArray(c.category_gmv_distribution) ? (c.category_gmv_distribution as J[]).map((x) => String(x.category_id)) : [];
  const cats = [...new Set([...declaradas, ...vende])].filter((id) => id && id !== "-1");
  const demo = (c.top_follower_demographics as J) || (c.follower_demographics as J) || null;
  return {
    nivel: num(perfil.creator_level ?? c.creator_level ?? c.level),
    seguidores: num(c.follower_count),
    categorias: cats,
    media_views_video: num(c.avg_ec_video_play_count ?? c.avg_ec_video_view_count),
    media_views_live: num(c.avg_ec_live_view_count ?? c.avg_ec_live_uv),
    demografia: demo ? { idades: demo.age_ranges ?? null, genero: (demo.major_gender as J)?.gender ?? demo.major_gender ?? null } : null,
    gmv_perfil: money(c.gmv),
    gmv_perfil_moeda: str((c.gmv as J)?.currency),
    gmv_video: money(c.video_gmv),
    gmv_live: money(c.live_gmv),
  };
}

// Perfil (marketplace_creators/{id}) dos criadores sem perfil ou com perfil de mais de 1 dia; no máximo `max` por rodada.
export async function coletarPerfisCriadores(loja: LojaTikTok, opts: { max?: number; orcamentoMs?: number } = {}): Promise<{ perfis: number; erros: number; erro?: string }> {
  const inicio = Date.now();
  const ontem = new Date(Date.now() - 86400000).toISOString();
  // prioridade: criadores com pedido de amostra PENDENTE (a nota depende do perfil); depois os demais
  const { data: comPedido } = await supabase.from("tiktok_amostras").select("criador_id").eq("loja_id", loja.lojaId).eq("status", "PENDING").not("criador_id", "is", null);
  const prioridade = [...new Set((comPedido || []).map((a) => a.criador_id as string))];
  const { data: pendentesPrio } = prioridade.length
    ? await supabase.from("tiktok_criadores").select("criador_id, perfil_em").in("criador_id", prioridade.slice(0, 500)).or(`perfil_em.is.null,perfil_em.lt.${ontem}`).order("perfil_em", { ascending: true, nullsFirst: true }).limit(opts.max ?? 40)
    : { data: [] as { criador_id: string; perfil_em: string | null }[] };
  const faltam = Math.max(0, (opts.max ?? 40) - (pendentesPrio || []).length);
  const { data: pendentesResto } = faltam
    ? await supabase.from("tiktok_criadores").select("criador_id, perfil_em").or(`perfil_em.is.null,perfil_em.lt.${ontem}`).order("perfil_em", { ascending: true, nullsFirst: true }).limit(faltam + (pendentesPrio || []).length)
    : { data: [] as { criador_id: string; perfil_em: string | null }[] };
  const vistos = new Set((pendentesPrio || []).map((c) => c.criador_id));
  const pendentes = [...(pendentesPrio || []), ...(pendentesResto || []).filter((c) => !vistos.has(c.criador_id))].slice(0, opts.max ?? 40);
  let perfis = 0;
  let erros = 0;
  try {
    for (const c of pendentes || []) {
      if (opts.orcamentoMs && Date.now() - inicio > opts.orcamentoMs) break;
      const r = await chamarComBackoff(loja, `/affiliate_seller/202608/marketplace_creators/${encodeURIComponent(c.criador_id)}`, {});
      if (Number(r.code) !== 0) {
        erros++;
        await supabase.from("tiktok_criadores").update({ perfil_em: new Date().toISOString(), ultimo_erro: `${r.code} ${String(r.message || "").slice(0, 120)}` }).eq("criador_id", c.criador_id);
        continue;
      }
      const p = mapearPerfilCriador((r.data as J) || {});
      await supabase
        .from("tiktok_criadores")
        // GMV do perfil vem em USD: guarda em gmv_usd (a nota usa gmv_brl da amostra quando existe)
        .update({ nivel: p.nivel, seguidores: p.seguidores ?? undefined, categorias: p.categorias, media_views_video: p.media_views_video ?? undefined, media_views_live: p.media_views_live, demografia: p.demografia, gmv_video: p.gmv_video, gmv_live: p.gmv_live, ...(p.gmv_perfil != null && String(p.gmv_perfil_moeda ?? "USD") === "USD" ? { gmv_usd: p.gmv_perfil } : {}), bruto: r.data, perfil_em: new Date().toISOString(), ultimo_erro: null })
        .eq("criador_id", c.criador_id);
      perfis++;
    }
    return { perfis, erros };
  } catch (e) {
    return { perfis, erros, erro: e instanceof Error ? e.message : String(e) };
  }
}

// Envios das amostras aprovadas (fulfillments/search) até constar vídeo ou live publicado.
export async function coletarEnviosAmostras(loja: LojaTikTok, opts: { max?: number; orcamentoMs?: number } = {}): Promise<{ checadas: number; envios: number; erro?: string }> {
  const inicio = Date.now();
  const { data: aprovadas } = await supabase
    .from("tiktok_amostras")
    .select("amostra_id")
    .eq("loja_id", loja.lojaId)
    .in("status", ["APPROVED", "SHIPPED", "DELIVERED", "COMPLETED", "FULFILLED"])
    .limit(opts.max ?? 40);
  const { data: comConteudo } = await supabase.from("tiktok_amostra_envios").select("amostra_id").eq("loja_id", loja.lojaId).eq("conteudo_publicado", true);
  const prontas = new Set((comConteudo || []).map((e) => e.amostra_id));
  let checadas = 0;
  let envios = 0;
  try {
    for (const a of (aprovadas || []).filter((x) => !prontas.has(x.amostra_id))) {
      if (opts.orcamentoMs && Date.now() - inicio > opts.orcamentoMs) break;
      const r = await chamarComBackoff(loja, `/affiliate_seller/202409/sample_applications/${encodeURIComponent(a.amostra_id)}/fulfillments/search`, { method: "POST", query: { page_size: "10" }, body: {} });
      checadas++;
      if (Number(r.code) !== 0) continue; // 98001004 = ainda sem envio
      const lista = (((r.data as J) || {}).fulfillments as J[]) || (((r.data as J) || {}).sample_fulfillments as J[]) || [];
      const linhas = lista.map((f) => {
        const conteudos = Array.isArray(f.contents) ? (f.contents as J[]) : Array.isArray(f.content_list) ? (f.content_list as J[]) : [];
        const c0 = conteudos[0] || {};
        return {
          loja_id: loja.lojaId,
          amostra_id: a.amostra_id,
          fulfillment_id: String(f.id ?? f.fulfillment_id ?? f.package_id ?? "1"),
          status: str(f.status ?? f.fulfillment_status),
          rastreio: str(f.tracking_number),
          enviado_em: unixIso(f.ship_time ?? f.shipped_time ?? f.create_time),
          conteudo_publicado: conteudos.length > 0 || !!f.content_id,
          conteudo_tipo: str(c0.content_type ?? f.content_type),
          conteudo_id: str(c0.content_id ?? c0.id ?? f.content_id),
          bruto: f,
          checado_em: new Date().toISOString(),
        };
      });
      if (linhas.length) await supabase.from("tiktok_amostra_envios").upsert(linhas, { onConflict: "loja_id,amostra_id,fulfillment_id" });
      envios += linhas.length;
    }
    return { checadas, envios };
  } catch (e) {
    return { checadas, envios, erro: e instanceof Error ? e.message : String(e) };
  }
}
