import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Probe de permissão do módulo Ads / GMV Max (GMS). A spec manda checar ANTES de
// codar: se get_total_balance (ou os GMS) der error_permission_denied, o módulo
// precisa ser habilitado via Shopee Partner Support. Retorna as respostas cruas.
const BASE = process.env.SHOPEE_API_BASE_URL || "https://partner.shopeemobile.com";

async function obterToken(lojaId: string) {
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

async function chamar(path: string, at: string, shop: string, extra = ""): Promise<unknown> {
  const pid = process.env.SHOPEE_PARTNER_ID!;
  const pkey = process.env.SHOPEE_PARTNER_KEY!;
  const ts = Math.floor(Date.now() / 1000);
  const sign = crypto.createHmac("sha256", pkey).update(`${pid}${path}${ts}${at}${shop}`).digest("hex");
  const url =
    `${BASE}${path}?partner_id=${pid}&timestamp=${ts}` +
    `&access_token=${encodeURIComponent(at)}&shop_id=${shop}&sign=${sign}${extra}`;
  try {
    const r = await fetch(url, { cache: "no-store" });
    return await r.json();
  } catch (e) {
    return { erro_fetch: e instanceof Error ? e.message : "erro" };
  }
}

// Resume cada resposta: só o error/message (o que importa pra permissão).
function resumo(r: unknown): { error?: string; message?: string; temResposta: boolean } {
  const o = (r || {}) as Record<string, unknown>;
  return {
    error: (o.error as string) || undefined,
    message: (o.message as string) || undefined,
    temResposta: !!o.response,
  };
}

export async function GET(request: NextRequest) {
  const loja = request.nextUrl.searchParams.get("loja");
  const cru = request.nextUrl.searchParams.get("cru") === "1";
  const t = await obterToken(loja || "");
  if (!t) return NextResponse.json({ sucesso: false, erro: "loja sem token ativo" });

  const balance = await chamar("/api/v2/ads/get_total_balance", t.at, t.shop);
  const campanhas = await chamar(
    "/api/v2/ads/get_product_level_campaign_id_list",
    t.at,
    t.shop,
    "&offset=0&limit=50&ad_type=all"
  );

  return NextResponse.json({
    sucesso: true,
    loja,
    get_total_balance: cru ? balance : resumo(balance),
    get_product_level_campaign_id_list: cru ? campanhas : resumo(campanhas),
  });
}
