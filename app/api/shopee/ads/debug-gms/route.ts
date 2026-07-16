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

// SONDAGEM ENXUTA do GMS (= provável GMV Max). Só 2 chamadas, para não bater
// no rate limit da API de Ads. ?dia=DD-MM-YYYY opcional (padrão: ontem).
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

    const ontem = new Date();
    ontem.setDate(ontem.getDate() - 1);
    const dia = request.nextUrl.searchParams.get("dia") || ddmmyyyy(ontem);

    // Chamada 1: performance das campanhas GMS (GMV Max).
    const gmsCampanha = await chamar("/api/v2/ads/get_gms_campaign_performance", {
      start_date: dia,
      end_date: dia,
    });

    // Chamada 2: performance POR ITEM — a peça que decide tudo.
    const gmsItem = await chamar("/api/v2/ads/get_gms_item_performance", {
      start_date: dia,
      end_date: dia,
    });

    function resumir(r: unknown) {
      const resp = (r as { response?: unknown })?.response;
      const erro = (r as { error?: string; message?: string })?.error;
      return {
        erro: erro ? `${erro} | ${(r as { message?: string }).message}` : null,
        // devolve cru p/ vermos os campos reais
        resposta: resp ?? null,
      };
    }

    return NextResponse.json({
      sucesso: true,
      shop_id: shopId,
      dia,
      gms_campanha: resumir(gmsCampanha),
      gms_item: resumir(gmsItem),
      leitura:
        "Se 'gms_item' trouxer item_id + metricas, o funil por anuncio sai por API. " +
        "'ads_rate_limit_total_api' = so limite de chamadas; espere alguns minutos e recarregue.",
    });
  } catch (error) {
    return NextResponse.json(
      { sucesso: false, erro: error instanceof Error ? error.message : "Erro." },
      { status: 500 }
    );
  }
}
