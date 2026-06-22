import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const BASE_URL =
  process.env.SHOPEE_API_BASE_URL || "https://partner.shopeemobile.com";

function gerarAssinatura(
  partnerId: string,
  path: string,
  timestamp: number,
  accessToken: string,
  shopId: string,
  partnerKey: string
) {
  return crypto
    .createHmac("sha256", partnerKey)
    .update(`${partnerId}${path}${timestamp}${accessToken}${shopId}`)
    .digest("hex");
}

// Diagnóstico: busca o get_escrow_detail (financeiro/repasse) de um pedido e
// devolve o JSON cru, para mapearmos qual campo equivale ao "Pedidos Pagos"
// do Shopee e ao valor líquido a receber.
// Use ?order_sn=XXXX ou deixe em branco para pegar o pedido pago mais recente.
export async function GET(request: NextRequest) {
  try {
    const partnerId = process.env.SHOPEE_PARTNER_ID;
    const partnerKey = process.env.SHOPEE_PARTNER_KEY;

    if (!partnerId || !partnerKey) {
      return NextResponse.json(
        { sucesso: false, erro: "Credenciais Shopee não configuradas." },
        { status: 500 }
      );
    }

    const { data: token } = await supabase
      .from("marketplace_tokens")
      .select("*")
      .eq("marketplace", "shopee")
      .eq("status", "ativo")
      .limit(1)
      .single();

    if (!token?.access_token || !token?.shop_id) {
      return NextResponse.json(
        { sucesso: false, erro: "Nenhuma loja Shopee com token ativo." },
        { status: 400 }
      );
    }

    let orderSn = request.nextUrl.searchParams.get("order_sn") || "";

    if (!orderSn) {
      const { data: pedido } = await supabase
        .from("pedidos")
        .select("pedido_externo_id")
        .eq("loja_id", token.loja_id)
        .eq("marketplace", "shopee")
        .not("pedido_externo_id", "like", "SH-%")
        .order("data_pedido", { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();

      orderSn = pedido?.pedido_externo_id || "";
    }

    if (!orderSn) {
      return NextResponse.json(
        { sucesso: false, erro: "Nenhum pedido real encontrado." },
        { status: 404 }
      );
    }

    const path = "/api/v2/payment/get_escrow_detail";
    const timestamp = Math.floor(Date.now() / 1000);
    const shopId = String(token.shop_id);
    const accessToken = token.access_token;

    const sign = gerarAssinatura(
      String(partnerId),
      path,
      timestamp,
      accessToken,
      shopId,
      String(partnerKey)
    );

    const url = new URL(`${BASE_URL}${path}`);
    url.searchParams.set("partner_id", String(partnerId));
    url.searchParams.set("timestamp", String(timestamp));
    url.searchParams.set("access_token", accessToken);
    url.searchParams.set("shop_id", shopId);
    url.searchParams.set("sign", sign);
    url.searchParams.set("order_sn", orderSn);

    const response = await fetch(url.toString(), {
      method: "GET",
      cache: "no-store",
    });

    const resultado = await response.json();

    return NextResponse.json({
      sucesso: !resultado?.error,
      order_sn: orderSn,
      // order_income tem o detalhamento financeiro (descontos, cupons, taxas,
      // valor pago pelo comprador e escrow líquido a receber).
      order_income: resultado?.response?.order_income ?? null,
      retorno_bruto: resultado,
    });
  } catch (error) {
    return NextResponse.json(
      {
        sucesso: false,
        erro: error instanceof Error ? error.message : "Erro desconhecido.",
      },
      { status: 500 }
    );
  }
}
