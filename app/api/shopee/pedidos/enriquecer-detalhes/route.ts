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

  const { data: tokenData, error: tokenError } = await supabase
    .from("marketplace_tokens")
    .select("shop_id, access_token")
    .eq("marketplace", "shopee")
    .eq("status", "ativo")
    .single();

  if (tokenError || !tokenData?.shop_id || !tokenData?.access_token) {
    return NextResponse.json({
      sucesso: false,
      erro: "Token Shopee não encontrado.",
    });
  }

  const path = "/api/v2/shop/get_shop_info";
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

  const response = await fetch(url.toString(), {
    method: "GET",
    cache: "no-store",
  });

  const resultado = await response.json();

  return NextResponse.json({
    sucesso: !resultado.error,
    status_http: response.status,
    retorno_shopee: resultado,
  });
}