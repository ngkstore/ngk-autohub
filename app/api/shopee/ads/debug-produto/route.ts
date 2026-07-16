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

function ddmmyyyy(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()}`;
}

// SONDAGEM (só leitura): a API de Ads entrega dados POR PRODUTO/campanha?
// E vem "add to cart"? É o que decide se o Raio-X do Anúncio roda 100%
// automático (sem planilha). ?loja=<id> opcional.
export async function GET(request: NextRequest) {
  try {
    const partnerId = process.env.SHOPEE_PARTNER_ID;
    const partnerKey = process.env.SHOPEE_PARTNER_KEY;
    if (!partnerId || !partnerKey) {
      return NextResponse.json({ sucesso: false, erro: "Credenciais ausentes." }, { status: 500 });
    }

    const lojaId = request.nextUrl.searchParams.get("loja") || "";
    const q = supabase
      .from("marketplace_tokens")
      .select("access_token, shop_id")
      .eq("marketplace", "shopee")
      .eq("status", "ativo");
    const { data: token } = lojaId
      ? await q.eq("loja_id", lojaId).limit(1).maybeSingle()
      : await q.limit(1).maybeSingle();

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
      const r = await fetch(url.toString(), { method: "GET", cache: "no-store" });
      return r.json();
    }

    // Ontem (dia fechado).
    const ontem = new Date();
    ontem.setDate(ontem.getDate() - 1);
    const dia = ddmmyyyy(ontem);

    // 1) Lista de campanhas por produto.
    const lista = await chamar("/api/v2/ads/get_product_level_campaign_id_list", {
      offset: "0",
      limit: "10",
    });

    // Tenta achar os ids de campanha na resposta (formato pode variar).
    const resp = lista?.response ?? {};
    const brutos: unknown[] =
      resp.campaign_list || resp.campaign_id_list || resp.list || [];
    const ids = (Array.isArray(brutos) ? brutos : [])
      .map((c: unknown) =>
        typeof c === "object" && c !== null
          ? (c as { campaign_id?: number | string }).campaign_id
          : c
      )
      .filter(Boolean)
      .slice(0, 5);

    // 2) Performance diária dessas campanhas (é aqui que veríamos add_to_cart).
    let performance = null;
    if (ids.length > 0) {
      performance = await chamar("/api/v2/ads/get_product_campaign_daily_performance", {
        campaign_id_list: ids.join(","),
        start_date: dia,
        end_date: dia,
      });
    }

    return NextResponse.json({
      sucesso: true,
      shop_id: shopId,
      dia,
      campanhas: {
        resposta: lista?.response ?? null,
        erro: lista?.error ? `${lista.error} | ${lista.message}` : null,
        ids_encontrados: ids,
      },
      performance_por_campanha: {
        resposta: performance?.response ?? null,
        erro: performance?.error ? `${performance.error} | ${performance.message}` : null,
        campos: performance?.response
          ? Object.keys(
              (Array.isArray(performance.response)
                ? performance.response[0]
                : performance.response) || {}
            )
          : null,
      },
      leitura:
        "Procure por: campaign_id/item_id ligando a campanha ao produto, e se vem 'add_to_cart'. " +
        "Se vier, o Raio-X roda 100% por API (sem planilha).",
    });
  } catch (error) {
    return NextResponse.json(
      { sucesso: false, erro: error instanceof Error ? error.message : "Erro." },
      { status: 500 }
    );
  }
}
