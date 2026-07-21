import crypto from "crypto";

// Domínios do TikTok Shop.
export const TIKTOK_BASE =
  process.env.TIKTOK_API_BASE_URL || "https://open-api.tiktokglobalshop.com";
export const TIKTOK_AUTH = "https://auth.tiktok-shops.com";
export const TIKTOK_SERVICE_ID =
  process.env.TIKTOK_SERVICE_ID || "7664520869394188053";

function appKey() {
  const k = process.env.TIKTOK_APP_KEY;
  if (!k) throw new Error("TIKTOK_APP_KEY ausente na Vercel.");
  return k;
}
function appSecret() {
  const s = process.env.TIKTOK_APP_SECRET;
  if (!s) throw new Error("TIKTOK_APP_SECRET ausente na Vercel.");
  return s;
}

// Assinatura do TikTok Shop (diferente da Shopee):
// signString = app_secret + path + (para cada param ordenado: chave+valor) + body + app_secret
// exclui os params 'sign' e 'access_token'. HMAC-SHA256 em hex.
export function assinarTikTok(
  path: string,
  query: Record<string, string>,
  body: string
): string {
  const secret = appSecret();
  const chaves = Object.keys(query)
    .filter((k) => k !== "sign" && k !== "access_token")
    .sort();
  let base = path;
  for (const k of chaves) base += k + query[k];
  const assinado = secret + base + body + secret;
  return crypto.createHmac("sha256", secret).update(assinado).digest("hex");
}

// Chamada assinada à API do TikTok Shop (para depois do OAuth).
export async function chamarTikTok(
  path: string,
  opts: {
    method?: "GET" | "POST";
    accessToken?: string;
    shopCipher?: string;
    query?: Record<string, string>;
    body?: unknown;
  } = {}
) {
  const { method = "GET", accessToken, shopCipher, query = {}, body } = opts;
  const timestamp = String(Math.floor(Date.now() / 1000));
  const bodyStr = body ? JSON.stringify(body) : "";

  const q: Record<string, string> = {
    app_key: appKey(),
    timestamp,
    ...query,
  };
  if (shopCipher) q.shop_cipher = shopCipher;
  q.sign = assinarTikTok(path, q, bodyStr);

  const url = `${TIKTOK_BASE}${path}?${new URLSearchParams(q).toString()}`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (accessToken) headers["x-tts-access-token"] = accessToken;

  const resp = await fetch(url, {
    method,
    headers,
    body: method === "POST" ? bodyStr : undefined,
    cache: "no-store",
  });
  return resp.json();
}

// Troca o auth_code por access_token (endpoint de auth, NÃO assinado).
export async function trocarCodePorToken(authCode: string) {
  const url =
    `${TIKTOK_AUTH}/api/v2/token/get` +
    `?app_key=${encodeURIComponent(appKey())}` +
    `&app_secret=${encodeURIComponent(appSecret())}` +
    `&auth_code=${encodeURIComponent(authCode)}` +
    `&grant_type=authorized_code`;
  const resp = await fetch(url, { method: "GET", cache: "no-store" });
  return resp.json();
}

// Renova o access_token pelo refresh_token.
export async function renovarTokenTikTok(refreshToken: string) {
  const url =
    `${TIKTOK_AUTH}/api/v2/token/refresh` +
    `?app_key=${encodeURIComponent(appKey())}` +
    `&app_secret=${encodeURIComponent(appSecret())}` +
    `&refresh_token=${encodeURIComponent(refreshToken)}` +
    `&grant_type=refresh_token`;
  const resp = await fetch(url, { method: "GET", cache: "no-store" });
  return resp.json();
}

// Lista as lojas autorizadas (traz shop_id + shop_cipher, necessários p/ as chamadas).
export async function listarLojasAutorizadas(accessToken: string) {
  return chamarTikTok("/authorization/202309/shops", {
    method: "GET",
    accessToken,
  });
}
