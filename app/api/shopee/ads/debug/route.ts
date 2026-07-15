import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BASE_URL =
  process.env.SHOPEE_API_BASE_URL || "https://partner.shopeemobile.com";

function assinar(
  partnerId: string,
  path: string,
  ts: number,
  accessToken: string,
  shopId: string,
  partnerKey: string
) {
  return crypto
    .createHmac("sha256", partnerKey)
    .update(`${partnerId}${path}${ts}${accessToken}${shopId}`)
    .digest("hex");
}

// Data no formato que a API de Ads usa: DD-MM-YYYY.
function ddmmyyyy(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()}`;
}

// SONDAGEM da API de Ads (não altera nada): descobre se este app/loja tem
// acesso à API de anúncios e o que ela devolve (impressões, cliques, gasto,
// conversões, ROAS). ?loja=<id> opcional; senão usa o 1º token ativo.
export async function GET(request: NextRequest) {
  try {
    const partnerId = process.env.SHOPEE_PARTNER_ID;
    const partnerKey = process.env.SHOPEE_PARTNER_KEY;
    if (!partnerId || !partnerKey) {
      return NextResponse.json({ sucesso: false, erro: "Credenciais ausentes." }, { status: 500 });
    }

    const lojaId = request.nextUrl.searchParams.get("loja") || "";
    const tokenQuery = supabase
      .from("marketplace_tokens")
      .select("access_token, shop_id, loja_id")
      .eq("marketplace", "shopee")
      .eq("status", "ativo");
    const { data: token } = lojaId
      ? await tokenQuery.eq("loja_id", lojaId).limit(1).maybeSingle()
      : await tokenQuery.limit(1).maybeSingle();

    if (!token?.access_token || !token?.shop_id) {
      return NextResponse.json({ sucesso: false, erro: "Token ativo não encontrado." }, { status: 400 });
    }

    const shopId = String(token.shop_id);
    const accessToken = token.access_token;

    async function chamar(path: string, params: Record<string, string> = {}) {
      const ts = Math.floor(Date.now() / 1000);
      const sign = assinar(String(partnerId), path, ts, accessToken, shopId, String(partnerKey));
      const url = new URL(`${BASE_URL}${path}`);
      url.searchParams.set("partner_id", String(partnerId));
      url.searchParams.set("timestamp", String(ts));
      url.searchParams.set("access_token", accessToken);
      url.searchParams.set("shop_id", shopId);
      url.searchParams.set("sign", sign);
      for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
      const resp = await fetch(url.toString(), { method: "GET", cache: "no-store" });
      return resp.json();
    }

    const hoje = new Date();
    const seteDias = new Date();
    seteDias.setDate(hoje.getDate() - 7);

    // 1) Teste de ACESSO (saldo de créditos) — param mínimo.
    const saldo = await chamar("/api/v2/ads/get_total_balance");

    // 2) Performance diária da loja (impressões/cliques/gasto/conversões/ROAS).
    const performance = await chamar("/api/v2/ads/get_all_cpc_ads_daily_performance", {
      start_date: ddmmyyyy(seteDias),
      end_date: ddmmyyyy(hoje),
    });

    return NextResponse.json({
      sucesso: true,
      shop_id: shopId,
      periodo: `${ddmmyyyy(seteDias)} a ${ddmmyyyy(hoje)}`,
      saldo_creditos: {
        resposta: saldo?.response ?? null,
        erro: saldo?.error ? `${saldo.error} | ${saldo.message}` : null,
      },
      performance_diaria: {
        resposta: performance?.response ?? null,
        erro: performance?.error ? `${performance.error} | ${performance.message}` : null,
      },
      leitura:
        "Se 'saldo' e 'performance' vierem sem erro, você TEM acesso à API de Ads. " +
        "Erro tipo 'no permission'/'invalid access token scope' = falta o escopo de Ads no app parceiro.",
    });
  } catch (error) {
    return NextResponse.json(
      { sucesso: false, erro: error instanceof Error ? error.message : "Erro." },
      { status: 500 }
    );
  }
}
