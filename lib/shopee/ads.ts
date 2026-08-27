import crypto from "crypto";
import { supabase } from "@/lib/supabase";

const BASE_URL = process.env.SHOPEE_API_BASE_URL || "https://partner.shopeemobile.com";
const PATH = "/api/v2/ads/get_all_cpc_ads_daily_performance";

type TokenLoja = { accessToken: string; shopId: string };

async function obterToken(lojaId: string): Promise<TokenLoja | null> {
  const { data } = await supabase
    .from("marketplace_tokens")
    .select("access_token, shop_id")
    .eq("marketplace", "shopee")
    .eq("status", "ativo")
    .eq("loja_id", lojaId)
    .limit(1)
    .maybeSingle();
  if (!data?.access_token || !data?.shop_id) return null;
  return { accessToken: data.access_token, shopId: String(data.shop_id) };
}

function assinar(partnerId: string, partnerKey: string, accessToken: string, shopId: string, ts: number) {
  return crypto
    .createHmac("sha256", partnerKey)
    .update(`${partnerId}${PATH}${ts}${accessToken}${shopId}`)
    .digest("hex");
}

// A API de Ads usa DD-MM-YYYY.
function ddmmyyyy(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()}`;
}

// Busca a resposta CRUA da performance diária (usado tanto pelo debug quanto
// pela sincronização). Janela [hoje-dias, hoje].
export async function buscarAdsBruto(
  lojaId: string,
  dias = 29,
  rango?: { ini: string; fim: string }
): Promise<{ ok: boolean; erro?: string; response?: unknown }> {
  const token = await obterToken(lojaId);
  if (!token) return { ok: false, erro: "sem token ativo" };
  const partnerId = process.env.SHOPEE_PARTNER_ID!;
  const partnerKey = process.env.SHOPEE_PARTNER_KEY!;
  const ts = Math.floor(Date.now() / 1000);
  const sign = assinar(partnerId, partnerKey, token.accessToken, token.shopId, ts);
  // Intervalo explícito (ini/fim = 'YYYY-MM-DD') tem prioridade — usado no
  // backfill mês a mês (a API do Ads não aceita janela > 1 mês). Sem rango, cai
  // no modo do cron ao vivo: [hoje-dias, hoje].
  let ini: Date, fim: Date;
  if (rango) {
    ini = new Date(`${rango.ini}T12:00:00-03:00`);
    fim = new Date(`${rango.fim}T12:00:00-03:00`);
  } else {
    fim = new Date();
    ini = new Date();
    ini.setDate(fim.getDate() - dias);
  }
  const url =
    `${BASE_URL}${PATH}?partner_id=${partnerId}&timestamp=${ts}` +
    `&access_token=${encodeURIComponent(token.accessToken)}&shop_id=${token.shopId}&sign=${sign}` +
    `&start_date=${ddmmyyyy(ini)}&end_date=${ddmmyyyy(fim)}`;
  const r = await fetch(url, { method: "GET", cache: "no-store" });
  const data = await r.json().catch(() => null);
  if (data?.error) return { ok: false, erro: `${data.error} | ${data.message || ""}` };
  return { ok: true, response: data?.response };
}

function num(...vs: unknown[]): number | null {
  for (const v of vs) {
    if (v === null || v === undefined || v === "") continue;
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

// Aceita array direto ou objeto com lista aninhada (nomes variam por versão).
function extrairLista(response: unknown): Record<string, unknown>[] {
  if (Array.isArray(response)) return response as Record<string, unknown>[];
  const o = (response || {}) as Record<string, unknown>;
  for (const chave of ["performance_list", "list", "daily_performance", "performance"]) {
    if (Array.isArray(o[chave])) return o[chave] as Record<string, unknown>[];
  }
  return [];
}

// "24-08-2026" / "2026-08-24" / epoch(seg) -> "2026-08-24"
function parseDia(v: unknown): string | null {
  if (typeof v === "number" || /^\d{9,10}$/.test(String(v))) {
    return new Date(Number(v) * 1000).toISOString().slice(0, 10);
  }
  const s = String(v || "");
  let m = s.match(/^(\d{2})-(\d{2})-(\d{4})$/); // DD-MM-YYYY
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); // YYYY-MM-DD
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
}

export type ResultadoAds = { lojaId: string; importados: number; erro?: string };

// Sincroniza a performance diária de Ads (nível loja) para ads_diario.
export async function sincronizarAdsLoja({
  lojaId,
  dias = 29,
  ini,
  fim,
}: {
  lojaId: string;
  dias?: number;
  ini?: string;
  fim?: string;
}): Promise<ResultadoAds> {
  const bruto = await buscarAdsBruto(lojaId, dias, ini && fim ? { ini, fim } : undefined);
  if (!bruto.ok) return { lojaId, importados: 0, erro: bruto.erro };

  const lista = extrairLista(bruto.response);
  if (lista.length === 0) return { lojaId, importados: 0 };

  const linhas = lista
    .map((row) => {
      const dia = parseDia(row.date ?? row.dia ?? row.report_date);
      if (!dia) return null;
      return {
        loja_id: lojaId,
        dia,
        impressoes: num(row.impression, row.impressions),
        cliques: num(row.clicks, row.click),
        ctr: num(row.ctr),
        gasto: num(row.expense, row.cost),
        pedidos_direto: num(row.direct_order, row.direct_orders_count),
        pedidos_broad: num(row.broad_order, row.broad_orders_count),
        gmv_direto: num(row.direct_gmv, row.direct_order_amount),
        gmv_broad: num(row.broad_gmv, row.broad_order_amount),
        roas_direto: num(row.direct_roas, row.direct_roi),
        roas_broad: num(row.broad_roas, row.broad_roi),
        bruto: row,
        atualizado_em: new Date().toISOString(),
      };
    })
    .filter(Boolean) as Record<string, unknown>[];

  if (linhas.length === 0) return { lojaId, importados: 0 };

  const { error } = await supabase
    .from("ads_diario")
    .upsert(linhas, { onConflict: "loja_id,dia" });
  if (error) return { lojaId, importados: 0, erro: error.message };

  return { lojaId, importados: linhas.length };
}
