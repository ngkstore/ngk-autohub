import crypto from "crypto";
import { supabase } from "@/lib/supabase";

const BASE_URL = process.env.SHOPEE_API_BASE_URL || "https://partner.shopeemobile.com";

const UFS = new Set([
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB",
  "PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO",
]);

// Extrai a UF do sort_code da Shopee Xpress (ex.: "SOC-MG2" -> MG, "HUB-LMG-61" -> MG).
// Best-effort: varre pares de letras; guardamos o código cru p/ corrigir depois.
function extrairUf(...codes: (string | undefined | null)[]): string | null {
  for (const code of codes) {
    const s = (code || "").toUpperCase().replace(/[^A-Z]/g, "");
    for (let i = 0; i + 1 < s.length; i++) {
      const par = s.slice(i, i + 2);
      if (UFS.has(par)) return par;
    }
  }
  return null;
}

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

function assinar(path: string, accessToken: string, shopId: string, ts: number) {
  const partnerId = process.env.SHOPEE_PARTNER_ID!;
  const partnerKey = process.env.SHOPEE_PARTNER_KEY!;
  return crypto
    .createHmac("sha256", partnerKey)
    .update(`${partnerId}${path}${ts}${accessToken}${shopId}`)
    .digest("hex");
}

// get_shipping_document_data_info (order_sn no topo) -> sort_code -> UF/hub.
async function buscarRegiao(token: TokenLoja, orderSn: string) {
  const partnerId = process.env.SHOPEE_PARTNER_ID!;
  const path = "/api/v2/logistics/get_shipping_document_data_info";
  const ts = Math.floor(Date.now() / 1000);
  const sign = assinar(path, token.accessToken, token.shopId, ts);
  const url =
    `${BASE_URL}${path}?partner_id=${partnerId}&timestamp=${ts}` +
    `&access_token=${encodeURIComponent(token.accessToken)}&shop_id=${token.shopId}&sign=${sign}`;
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ order_sn: orderSn }),
    cache: "no-store",
  });
  const data = await r.json().catch(() => null);
  const info = data?.response?.shipping_document_info;
  if (!info) return { uf: null as string | null, hub: null as string | null };
  const sc = info.recipient_sort_code || {};
  const hub = sc.first_recipient_sort_code || sc.second_recipient_sort_code || null;
  const uf = extrairUf(sc.first_recipient_sort_code, sc.second_recipient_sort_code, sc.third_recipient_sort_code);
  return { uf, hub };
}

// get_tracking_info -> data de envio (coletado) e entrega.
async function buscarDatas(token: TokenLoja, orderSn: string) {
  const partnerId = process.env.SHOPEE_PARTNER_ID!;
  const path = "/api/v2/logistics/get_tracking_info";
  const ts = Math.floor(Date.now() / 1000);
  const sign = assinar(path, token.accessToken, token.shopId, ts);
  const url =
    `${BASE_URL}${path}?partner_id=${partnerId}&timestamp=${ts}` +
    `&access_token=${encodeURIComponent(token.accessToken)}&shop_id=${token.shopId}&sign=${sign}` +
    `&order_sn=${orderSn}`;
  const r = await fetch(url, { method: "GET", cache: "no-store" });
  const data = await r.json().catch(() => null);
  const eventos: { update_time?: number; logistics_status?: string; description?: string }[] =
    data?.response?.tracking_info || [];
  let enviado: number | null = null;
  let entregue: number | null = null;
  for (const e of eventos) {
    const st = (e.logistics_status || "").toUpperCase();
    const d = (e.description || "").toLowerCase();
    if (!enviado && (st.includes("PICKED_UP") || d.includes("coletado") || d.includes("postado"))) {
      enviado = e.update_time ?? null;
    }
    if (st.includes("DELIVERED") || d.includes("entregue")) {
      entregue = e.update_time ?? null;
    }
  }
  return {
    enviado_em: enviado ? new Date(enviado * 1000).toISOString() : null,
    entregue_em: entregue ? new Date(entregue * 1000).toISOString() : null,
  };
}

export type ResultadoRegiao = { lojaId: string; processados: number; comUf: number; erro?: string };

// Enriquece pedidos da loja que ainda não têm UF: pega região (sort_code) e
// datas de envio/entrega. Bounded por 'limite' pra rodadas curtas.
export async function enriquecerRegiaoLoja({
  lojaId,
  limite = 40,
}: {
  lojaId: string;
  limite?: number;
}): Promise<ResultadoRegiao> {
  const token = await obterToken(lojaId);
  if (!token) return { lojaId, processados: 0, comUf: 0, erro: "sem token ativo" };

  // Re-tenta TODOS os sem-UF recentes (não só os nunca-tentados): o sort_code
  // muitas vezes não existe quando o pedido é novo (documento de envio ainda
  // não gerado); tentando de novo depois, ele aparece. Janela de 30 dias
  // (docs antigos expiram), menos-recentemente-tentado primeiro (nulls = nunca
  // tentado vêm antes). Só pedidos pagos.
  const desde = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: pedidos } = await supabase
    .from("pedidos")
    .select("id, pedido_externo_id")
    .eq("marketplace", "shopee")
    .eq("loja_id", lojaId)
    .eq("pedido_efetivado", true)
    .is("uf", null)
    .gte("data_pedido", desde)
    .not("pedido_externo_id", "like", "SH-%")
    .order("regiao_atualizada_em", { ascending: true, nullsFirst: true })
    .limit(limite);

  if (!pedidos || pedidos.length === 0) return { lojaId, processados: 0, comUf: 0 };

  let comUf = 0;
  for (const p of pedidos) {
    try {
      // As duas chamadas são independentes (endpoints diferentes) — em paralelo.
      const [{ uf, hub }, datas] = await Promise.all([
        buscarRegiao(token, p.pedido_externo_id),
        buscarDatas(token, p.pedido_externo_id),
      ]);
      // Só grava o que achou — re-try que falhar não apaga uf/hub/datas já
      // preenchidos (só marca regiao_atualizada_em pra ir pro fim da fila).
      const payload: Record<string, unknown> = { regiao_atualizada_em: new Date().toISOString() };
      if (uf) {
        payload.uf = uf;
        payload.hub_regiao = hub;
      }
      if (datas.enviado_em) payload.enviado_em = datas.enviado_em;
      if (datas.entregue_em) payload.entregue_em = datas.entregue_em;
      await supabase.from("pedidos").update(payload).eq("id", p.id);
      if (uf) comUf++;
    } catch {
      // pula este pedido; tenta na próxima rodada
    }
  }

  return { lojaId, processados: pedidos.length, comUf };
}
