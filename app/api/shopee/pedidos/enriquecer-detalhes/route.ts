import { NextResponse } from "next/server";
import crypto from "crypto";
import { supabase } from "@/lib/supabase";

const SHOPEE_API_URL = "https://partner.shopeemobile.com";

function gerarAssinatura(
  partnerId: string,
  path: string,
  timestamp: number,
  accessToken: string,
  shopId: string,
  partnerKey: string
) {
  const baseString = `${partnerId}${path}${timestamp}${accessToken}${shopId}`;

  return crypto
    .createHmac("sha256", partnerKey)
    .update(baseString)
    .digest("hex");
}

export async function GET() {
  const partnerId = process.env.SHOPEE_PARTNER_ID;
  const partnerKey = process.env.SHOPEE_PARTNER_KEY;

  if (!partnerId || !partnerKey) {
    return NextResponse.json({
      sucesso: false,
      erro: "Credenciais Shopee ausentes.",
    });
  }

  const { data: pedido, error: pedidoError } = await supabase
    .from("pedidos")
    .select("id, pedido_externo_id, loja_id")
    .eq("marketplace", "shopee")
    .not("pedido_externo_id", "is", null)
    .limit(1)
    .single();

  if (pedidoError || !pedido) {
    return NextResponse.json({
      sucesso: false,
      erro: "Pedido Shopee não encontrado.",
      detalhe: pedidoError?.message,
    });
  }

  const { data: tokenData, error: tokenError } = await supabase
    .from("marketplace_tokens")
    .select("shop_id, access_token")
    .eq("marketplace", "shopee")
    .eq("status", "ativo")
    .eq("loja_id", pedido.loja_id)
    .single();

  if (tokenError || !tokenData?.shop_id || !tokenData?.access_token) {
    return NextResponse.json({
      sucesso: false,
      erro: "Token Shopee não encontrado para a loja do pedido.",
      loja_id: pedido.loja_id,
    });
  }

  const path = "/api/v2/order/get_order_detail";
  const timestamp = Math.floor(Date.now() / 1000);

  const shopId = String(tokenData.shop_id);
  const accessToken = tokenData.access_token;

  const sign = gerarAssinatura(
    partnerId,
    path,
    timestamp,
    accessToken,
    shopId,
    partnerKey
  );

  const url = new URL(`${SHOPEE_API_URL}${path}`);

  url.searchParams.set("partner_id", partnerId);
  url.searchParams.set("timestamp", String(timestamp));
  url.searchParams.set("access_token", accessToken);
  url.searchParams.set("shop_id", shopId);
  url.searchParams.set("sign", sign);
  url.searchParams.set("order_sn_list", pedido.pedido_externo_id);
  url.searchParams.set(
    "response_optional_fields",
    [
      "buyer_user_id",
      "buyer_username",
      "recipient_address",
      "actual_shipping_fee",
      "estimated_shipping_fee",
      "item_list",
      "pay_time",
      "payment_method",
      "total_amount",
      "order_status",
      "shipping_carrier",
      "package_list",
      "invoice_data",
    ].join(",")
  );

  const response = await fetch(url.toString(), {
    method: "GET",
    cache: "no-store",
  });

  const resultado = await response.json();

  return NextResponse.json({
    sucesso: !resultado.error,
    pedido_teste: pedido.pedido_externo_id,
    status_http: response.status,
    retorno_shopee: resultado,
  });
}