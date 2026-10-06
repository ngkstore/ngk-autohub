import crypto from "crypto";
import { supabase } from "@/lib/supabase";
import { enviarTelegram } from "@/lib/telegram";

// Segundo app da Shopee Open Platform, só com o módulo AMS (Programa de
// Afiliados). Tem Partner ID/Key próprios e token próprio por loja — o app
// principal não tem esse módulo, e a permissão não "passa" entre apps.

const BASE = process.env.SHOPEE_API_BASE_URL || "https://partner.shopeemobile.com";

export function credenciaisAms() {
  const partnerId = process.env.SHOPEE_AMS_PARTNER_ID;
  const partnerKey = process.env.SHOPEE_AMS_PARTNER_KEY;
  if (!partnerId || !partnerKey) {
    throw new Error("SHOPEE_AMS_PARTNER_ID / SHOPEE_AMS_PARTNER_KEY não configurados na Vercel.");
  }
  return { partnerId, partnerKey };
}

function assinar(partnerKey: string, base: string) {
  return crypto.createHmac("sha256", partnerKey).update(base).digest("hex");
}

// URL de autorização do app de afiliados (o lojista autoriza logado na Shopee).
export function urlAutorizacaoAms(redirect: string) {
  const { partnerId, partnerKey } = credenciaisAms();
  const path = "/api/v2/shop/auth_partner";
  const ts = Math.floor(Date.now() / 1000);
  const u = new URL(`${BASE}${path}`);
  u.searchParams.set("partner_id", partnerId);
  u.searchParams.set("timestamp", String(ts));
  u.searchParams.set("sign", assinar(partnerKey, `${partnerId}${path}${ts}`));
  u.searchParams.set("redirect", redirect);
  return u.toString();
}

type RespostaToken = {
  error?: string;
  message?: string;
  access_token?: string;
  refresh_token?: string;
  expire_in?: number;
};

async function postAuth(path: string, body: Record<string, unknown>) {
  const { partnerId, partnerKey } = credenciaisAms();
  const ts = Math.floor(Date.now() / 1000);
  const url =
    `${BASE}${path}?partner_id=${partnerId}&timestamp=${ts}` +
    `&sign=${assinar(partnerKey, `${partnerId}${path}${ts}`)}`;
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, partner_id: Number(partnerId) }),
    cache: "no-store",
  });
  return (await r.json()) as RespostaToken;
}

async function gravar(lojaId: string, shopId: string, t: RespostaToken) {
  const expiraEm = new Date(Date.now() + Number(t.expire_in || 4 * 3600) * 1000).toISOString();
  const { error } = await supabase.from("shopee_ams_tokens").upsert(
    {
      loja_id: lojaId,
      shop_id: shopId,
      access_token: t.access_token,
      refresh_token: t.refresh_token,
      expira_em: expiraEm,
      status: "ativo",
      atualizado_em: new Date().toISOString(),
    },
    { onConflict: "loja_id" }
  );
  if (error) throw new Error(`gravar shopee_ams_tokens: ${error.message}`);
}

// Troca o code do callback pelo primeiro par de tokens.
export async function conectarAms(lojaId: string, shopId: string, code: string) {
  const t = await postAuth("/api/v2/auth/token/get", { code, shop_id: Number(shopId) });
  if (t.error || !t.access_token) {
    throw new Error(`token/get: ${t.error || "-"} | ${t.message || "-"}`);
  }
  await gravar(lojaId, shopId, t);
}

export type TokenAms = { at: string; shop: string };

// Token válido da loja, renovando se estiver a menos de 10 min de vencer.
// Renovação falhou (refresh_token vencido/revogado) -> status 'expirado':
// só reconectando em /integracoes.
export async function obterTokenAms(lojaId: string): Promise<TokenAms | null> {
  const { data } = await supabase
    .from("shopee_ams_tokens")
    .select("shop_id, access_token, refresh_token, expira_em, status")
    .eq("loja_id", lojaId)
    .maybeSingle();
  if (!data?.access_token || data.status !== "ativo") return null;

  const faltaMs = new Date(data.expira_em).getTime() - Date.now();
  if (faltaMs > 10 * 60_000) return { at: data.access_token, shop: String(data.shop_id) };

  const t = await postAuth("/api/v2/auth/access_token/get", {
    refresh_token: data.refresh_token,
    shop_id: Number(data.shop_id),
  });
  if (t.error || !t.access_token) {
    await supabase
      .from("shopee_ams_tokens")
      .update({ status: "expirado", atualizado_em: new Date().toISOString() })
      .eq("loja_id", lojaId);
    throw new Error(`renovar token AMS: ${t.error || "-"} | ${t.message || "-"}`);
  }
  await gravar(lojaId, String(data.shop_id), t);
  return { at: t.access_token, shop: String(data.shop_id) };
}

// Cron diário: mantém o refresh_token vivo (vale ~30 dias) mesmo sem uso.
export async function renovarTokensAms() {
  const { data } = await supabase.from("shopee_ams_tokens").select("loja_id, status");
  const saida: { lojaId: string; ok: boolean; erro?: string }[] = [];
  for (const l of data || []) {
    if (l.status !== "ativo") {
      saida.push({ lojaId: l.loja_id, ok: false, erro: l.status });
      continue;
    }
    try {
      // Força a renovação zerando a validade na leitura.
      await supabase
        .from("shopee_ams_tokens")
        .update({ expira_em: new Date().toISOString() })
        .eq("loja_id", l.loja_id);
      await obterTokenAms(l.loja_id);
      saida.push({ lojaId: l.loja_id, ok: true });
    } catch (e) {
      const erro = e instanceof Error ? e.message : String(e);
      saida.push({ lojaId: l.loja_id, ok: false, erro });
      await enviarTelegram(
        `⚠️ Afiliados Shopee: não consegui renovar o token da loja ${l.loja_id} (${erro.slice(0, 160)}).\n` +
          `Reconecte em /integracoes > Afiliados.`
      );
    }
  }
  return saida;
}

// Chamada ao módulo AMS (GET, ou POST se houver body). Retry no rate limit.
export async function chamarAms(
  path: string,
  tok: TokenAms,
  extra = "",
  body?: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const { partnerId, partnerKey } = credenciaisAms();
  for (let tent = 0; tent < 5; tent++) {
    const ts = Math.floor(Date.now() / 1000);
    const sign = assinar(partnerKey, `${partnerId}${path}${ts}${tok.at}${tok.shop}`);
    const url =
      `${BASE}${path}?partner_id=${partnerId}&timestamp=${ts}` +
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
    if (String(data?.error || "").includes("rate_limit")) {
      await new Promise((res) => setTimeout(res, 1500 * (tent + 1)));
      continue;
    }
    return data;
  }
  return { error: "rate_limit_esgotado" };
}
