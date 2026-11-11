import crypto from "crypto";
import { supabase } from "@/lib/supabase";
import { obterTokenLoja, type TokenLoja } from "@/lib/shopee/enriquecerEscrow";

// Chamada genérica assinada à Shopee Open Platform v2 (nível de loja), com
// renovação automática do access_token. Usada pelo módulo de Devoluções (Parte B).
//   chamarShopee({ lojaId, path: "/api/v2/returns/get_return_list", query: { page_no: 1 } })
//   chamarShopee({ lojaId, path: "/api/v2/returns/confirm", method: "POST", body: { return_sn } })
export type RespostaShopee<T = Record<string, unknown>> = { error?: string; message?: string; response?: T; request_id?: string };

function credenciais() {
  const partnerId = process.env.SHOPEE_PARTNER_ID;
  const partnerKey = process.env.SHOPEE_PARTNER_KEY;
  const baseUrl = process.env.SHOPEE_API_BASE_URL || "https://partner.shopeemobile.com";
  if (!partnerId || !partnerKey) throw new Error("Credenciais Shopee ausentes (SHOPEE_PARTNER_ID / SHOPEE_PARTNER_KEY).");
  return { partnerId, partnerKey, baseUrl };
}

function assinar(partnerId: string, partnerKey: string, path: string, timestamp: number, accessToken: string, shopId: string) {
  return crypto.createHmac("sha256", partnerKey).update(`${partnerId}${path}${timestamp}${accessToken}${shopId}`).digest("hex");
}

async function renovarToken(token: TokenLoja, partnerId: string, partnerKey: string, baseUrl: string) {
  const path = "/api/v2/auth/access_token/get";
  const timestamp = Math.floor(Date.now() / 1000);
  const sign = crypto.createHmac("sha256", partnerKey).update(`${partnerId}${path}${timestamp}`).digest("hex");
  const r = await fetch(`${baseUrl}${path}?partner_id=${partnerId}&timestamp=${timestamp}&sign=${sign}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: token.refreshToken, partner_id: Number(partnerId), shop_id: Number(token.shopId) }),
    cache: "no-store",
  });
  const data = await r.json();
  if (!r.ok || data.error || !data.access_token) throw new Error(`Falha ao renovar token Shopee: ${data?.error || "-"} | ${data?.message || "-"}`);
  await supabase
    .from("marketplace_tokens")
    .update({ access_token: data.access_token, refresh_token: data.refresh_token, expire_in: data.expire_in, atualizado_em: new Date().toISOString() })
    .eq("id", token.id);
  token.accessToken = data.access_token;
  token.refreshToken = data.refresh_token;
}

const cacheTokens = new Map<string, Promise<TokenLoja>>();
export function tokenShopeeDaLoja(lojaId: string): Promise<TokenLoja> {
  let t = cacheTokens.get(lojaId);
  if (!t) {
    t = obterTokenLoja(lojaId).catch((e) => {
      cacheTokens.delete(lojaId);
      throw e;
    });
    cacheTokens.set(lojaId, t);
  }
  return t;
}

export async function chamarShopee<T = Record<string, unknown>>(opts: {
  lojaId?: string;
  token?: TokenLoja;
  path: string;
  method?: "GET" | "POST";
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
}): Promise<RespostaShopee<T>> {
  const { partnerId, partnerKey, baseUrl } = credenciais();
  const token = opts.token ?? (opts.lojaId ? await tokenShopeeDaLoja(opts.lojaId) : null);
  if (!token) throw new Error("chamarShopee: informe lojaId ou token.");
  const method = opts.method ?? "GET";
  let renovou = false;

  while (true) {
    const timestamp = Math.floor(Date.now() / 1000);
    const sign = assinar(partnerId, partnerKey, opts.path, timestamp, token.accessToken, token.shopId);
    const q = new URLSearchParams({ partner_id: partnerId, timestamp: String(timestamp), access_token: token.accessToken, shop_id: token.shopId, sign });
    for (const [k, v] of Object.entries(opts.query ?? {})) if (v !== undefined && v !== null) q.set(k, String(v));
    const r = await fetch(`${baseUrl}${opts.path}?${q.toString()}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: method === "POST" ? JSON.stringify(opts.body ?? {}) : undefined,
      cache: "no-store",
    });
    const data = (await r.json()) as RespostaShopee<T>;
    const erroToken = data?.error === "invalid_access_token" || /token/i.test(String(data?.message || ""));
    if (data?.error && erroToken && !renovou) {
      renovou = true;
      await renovarToken(token, partnerId, partnerKey, baseUrl);
      continue;
    }
    return data;
  }
}
