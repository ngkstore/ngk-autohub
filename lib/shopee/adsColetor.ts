import crypto from "crypto";
import { supabase } from "@/lib/supabase";

// Coletor diário de Ads (Fase 1 da spec). A NGK usa product-level campaigns com
// lance GMV Max (meta ROAS) — a API os expõe como CPC. Fontes:
//   get_total_balance                     -> saldo de créditos
//   get_product_level_campaign_id_list    -> IDs das campanhas (paginado)
//   get_product_campaign_daily_performance-> performance por campanha/dia
//   get_product_level_campaign_setting_info-> config (meta ROAS, orçamento, item)
// Só LEITURA. Idempotente (upsert). Backoff no rate limit do Ads.

const BASE = process.env.SHOPEE_API_BASE_URL || "https://partner.shopeemobile.com";

type Tok = { at: string; shop: string };

async function obterToken(lojaId: string): Promise<Tok | null> {
  const { data } = await supabase
    .from("marketplace_tokens")
    .select("access_token, shop_id")
    .eq("marketplace", "shopee")
    .eq("status", "ativo")
    .eq("loja_id", lojaId)
    .limit(1)
    .maybeSingle();
  if (!data?.access_token || !data?.shop_id) return null;
  return { at: String(data.access_token), shop: String(data.shop_id) };
}

// Chama a Shopee (auth na URL; body opcional = POST). Retry/backoff no rate limit.
async function chamar(
  path: string,
  tok: Tok,
  extra = "",
  body?: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const pid = process.env.SHOPEE_PARTNER_ID!;
  const pkey = process.env.SHOPEE_PARTNER_KEY!;
  for (let tent = 0; tent < 5; tent++) {
    const ts = Math.floor(Date.now() / 1000);
    const sign = crypto.createHmac("sha256", pkey).update(`${pid}${path}${ts}${tok.at}${tok.shop}`).digest("hex");
    const url =
      `${BASE}${path}?partner_id=${pid}&timestamp=${ts}` +
      `&access_token=${encodeURIComponent(tok.at)}&shop_id=${tok.shop}&sign=${sign}${extra}`;
    let data: Record<string, unknown> = {};
    try {
      const r = await fetch(url, {
        method: body ? "POST" : "GET",
        cache: "no-store",
        ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
      });
      data = (await r.json()) as Record<string, unknown>;
    } catch (e) {
      data = { error: "fetch", message: e instanceof Error ? e.message : "erro" };
    }
    const err = String(data?.error || "");
    if (err.includes("rate_limit")) {
      await new Promise((res) => setTimeout(res, 1500 * (tent + 1))); // backoff
      continue;
    }
    return data;
  }
  return { error: "rate_limit_esgotado" };
}

const p2 = (n: number) => String(n).padStart(2, "0");
const ddmmyyyy = (d: Date) => `${p2(d.getUTCDate())}-${p2(d.getUTCMonth() + 1)}-${d.getUTCFullYear()}`;
const isoDia = (ddmm: string) => {
  const [d, m, y] = ddmm.split("-");
  return `${y}-${m}-${d}`;
};
const num = (v: unknown) => (v == null || v === "" ? null : Number(v));

export type ResultadoAdsColeta = {
  lojaId: string;
  campanhas: number;
  linhasPerf: number;
  linhasConfig: number;
  saldo: number | null;
  erro?: string;
};

// Coleta uma loja no intervalo [start, end] (Date UTC). Padrão: últimos 30 dias
// até ontem (dia de hoje é incompleto e a API recusa end_date=hoje).
export async function coletarAdsLoja({
  lojaId,
  dias = 30,
}: {
  lojaId: string;
  dias?: number;
}): Promise<ResultadoAdsColeta> {
  const tok = await obterToken(lojaId);
  if (!tok) return { lojaId, campanhas: 0, linhasPerf: 0, linhasConfig: 0, saldo: null, erro: "sem token" };

  const fim = new Date(Date.now() - 864e5); // ontem
  const ini = new Date(fim.getTime() - (dias - 1) * 864e5);
  const start = ddmmyyyy(ini);
  const end = ddmmyyyy(fim);

  // 1) Saldo (registra pra HOJE).
  const bal = await chamar("/api/v2/ads/get_total_balance", tok);
  const saldo = num((bal.response as Record<string, unknown>)?.total_balance);
  const hojeIso = new Date().toISOString().slice(0, 10);
  if (saldo != null) {
    await supabase.from("ads_saldo_diario").upsert(
      { loja_id: lojaId, dia: hojeIso, saldo, atualizado_em: new Date().toISOString() },
      { onConflict: "loja_id,dia" }
    );
  }

  // 2) Todas as campanhas (paginado).
  const ids: number[] = [];
  let offset = 0;
  for (let pag = 0; pag < 50; pag++) {
    const r = await chamar(
      "/api/v2/ads/get_product_level_campaign_id_list",
      tok,
      `&offset=${offset}&limit=100&ad_type=all`
    );
    const resp = (r.response as Record<string, unknown>) || {};
    const lista = (resp.campaign_list as Record<string, unknown>[]) || [];
    for (const c of lista) if (c.campaign_id) ids.push(Number(c.campaign_id));
    if (!resp.has_next_page || lista.length === 0) break;
    offset += lista.length;
  }
  if (ids.length === 0) return { lojaId, campanhas: 0, linhasPerf: 0, linhasConfig: 0, saldo };

  // 3) Config (meta ROAS, orçamento, item_id) — em blocos de 100. Guarda o mapa
  //    campaign_id -> item_id pra atribuir a performance ao item.
  const itemDeCampanha = new Map<number, number | null>();
  let linhasConfig = 0;
  for (let i = 0; i < ids.length; i += 100) {
    const bloco = ids.slice(i, i + 100);
    const r = await chamar(
      "/api/v2/ads/get_product_level_campaign_setting_info",
      tok,
      `&campaign_id_list=${bloco.join(",")}&info_type_list=1,2,3`
    );
    const lista = ((r.response as Record<string, unknown>)?.campaign_list as Record<string, unknown>[]) || [];
    const linhas = lista.map((c) => {
      const common = (c.common_info as Record<string, unknown>) || {};
      const manual = (c.manual_bidding_info as Record<string, unknown>) || {};
      const item = num(common.item_id ?? (c as Record<string, unknown>).item_id);
      const cid = Number(c.campaign_id);
      itemDeCampanha.set(cid, item);
      return {
        loja_id: lojaId,
        dia: hojeIso,
        campaign_id: cid,
        item_id: item,
        ad_type: String(common.ad_type ?? ""),
        meta_roas: num(manual.roi_target ?? manual.roas_target),
        orcamento: num(common.campaign_budget ?? common.daily_budget),
        data_inicio: common.campaign_duration
          ? new Date(Number((common.campaign_duration as Record<string, unknown>).start_time) * 1000)
              .toISOString()
              .slice(0, 10)
          : null,
        status: String(common.campaign_status ?? ""),
        bruto: c,
        atualizado_em: new Date().toISOString(),
      };
    });
    if (linhas.length) {
      await supabase.from("ads_campaign_config_daily").upsert(linhas, { onConflict: "loja_id,dia,campaign_id" });
      linhasConfig += linhas.length;
    }
  }

  // 4) Performance por campanha/dia (blocos de 100, o range de uma vez).
  let linhasPerf = 0;
  for (let i = 0; i < ids.length; i += 100) {
    const bloco = ids.slice(i, i + 100);
    const r = await chamar(
      "/api/v2/ads/get_product_campaign_daily_performance",
      tok,
      `&campaign_id_list=${bloco.join(",")}&start_date=${start}&end_date=${end}`
    );
    const lista = ((r.response as Record<string, unknown>)?.campaign_list as Record<string, unknown>[]) || [];
    const linhas: Record<string, unknown>[] = [];
    for (const c of lista) {
      const cid = Number(c.campaign_id);
      const item = itemDeCampanha.get(cid) ?? null;
      if (item == null) continue; // sem item mapeado -> pula (não quebra a chave)
      const metrics = (c.metrics_list as Record<string, unknown>[]) || [];
      for (const m of metrics) {
        const dia = isoDia(String(m.date));
        // Uma linha por escopo: direto (produto anunciado) e amplo (loja pós-clique).
        for (const esc of ["direto", "amplo"] as const) {
          const dir = esc === "direto";
          linhas.push({
            loja_id: lojaId,
            dia,
            campaign_id: cid,
            item_id: item,
            impressoes: num(m.impression),
            cliques: num(m.clicks),
            ctr: num(m.ctr),
            pedidos: num(dir ? m.direct_order : m.broad_order),
            gmv: num(dir ? m.direct_gmv : m.broad_gmv),
            gasto: num(m.expense), // gasto é da campanha (não separa direto/amplo)
            roas: num(dir ? m.direct_roi : m.broad_roi),
            cpc: num(m.cpc),
            cr: num(dir ? m.direct_cr : m.cr),
            escopo: esc,
            bruto: m,
            atualizado_em: new Date().toISOString(),
          });
        }
      }
    }
    // Upsert em blocos (evita payload gigante).
    for (let j = 0; j < linhas.length; j += 500) {
      const parte = linhas.slice(j, j + 500);
      await supabase.from("ads_item_performance_daily").upsert(parte, { onConflict: "loja_id,dia,item_id,escopo" });
      linhasPerf += parte.length;
    }
  }

  return { lojaId, campanhas: ids.length, linhasPerf, linhasConfig, saldo };
}
