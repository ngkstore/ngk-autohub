import crypto from "crypto";
import { supabase } from "@/lib/supabase";

export async function getShopeeConfig() {
  const { data } = await supabase
    .from("configuracoes")
    .select("*")
    .in("chave", [
      "shopee_partner_id",
      "shopee_partner_key",
      "shopee_redirect_url",
    ]);

  const configs: Record<string, string> = {};

  data?.forEach((item) => {
    configs[item.chave] = item.valor;
  });

  return configs;
}

export function gerarTimestamp() {
  return Math.floor(Date.now() / 1000);
}

export function gerarAssinatura(
  partnerId: string,
  partnerKey: string,
  path: string,
  timestamp: number,
  accessToken?: string,
  shopId?: string
) {
  let baseString = `${partnerId}${path}${timestamp}`;

  if (accessToken && shopId) {
    baseString += accessToken + shopId;
  }

  return crypto
    .createHmac("sha256", partnerKey)
    .update(baseString)
    .digest("hex");
}

export async function getTokenLoja(lojaId: string) {
  const { data } = await supabase
    .from("marketplace_tokens")
    .select("*")
    .eq("loja_id", lojaId)
    .single();

  return data;
}

export async function criarUrlAutorizacao() {
  const configs = await getShopeeConfig();

  const partnerId = configs.shopee_partner_id;
  const partnerKey = configs.shopee_partner_key;
  const redirectUrl = configs.shopee_redirect_url;

  if (!partnerId || !partnerKey) {
    throw new Error(
      "Partner ID ou Partner Key não configurados."
    );
  }

  const timestamp = gerarTimestamp();

  const path = "/api/v2/shop/auth_partner";

  const sign = gerarAssinatura(
    partnerId,
    partnerKey,
    path,
    timestamp
  );

  const url =
    `https://partner.shopeemobile.com${path}` +
    `?partner_id=${partnerId}` +
    `&timestamp=${timestamp}` +
    `&sign=${sign}` +
    `&redirect=${encodeURIComponent(
      redirectUrl ||
        "http://localhost:3000/api/shopee/callback"
    )}`;

  return url;
}

export async function requestShopee(
  lojaId: string,
  path: string,
  method: "GET" | "POST" = "GET",
  body?: unknown
) {
  const configs = await getShopeeConfig();

  const partnerId = configs.shopee_partner_id;
  const partnerKey = configs.shopee_partner_key;

  if (!partnerId || !partnerKey) {
    throw new Error(
      "Partner ID ou Partner Key não configurados."
    );
  }

  const token = await getTokenLoja(lojaId);

  if (!token) {
    throw new Error(
      "Loja ainda não possui token Shopee."
    );
  }

  const timestamp = gerarTimestamp();

  const sign = gerarAssinatura(
    partnerId,
    partnerKey,
    path,
    timestamp,
    token.access_token,
    token.shop_id
  );

  const url =
    `https://partner.shopeemobile.com${path}` +
    `?partner_id=${partnerId}` +
    `&timestamp=${timestamp}` +
    `&access_token=${token.access_token}` +
    `&shop_id=${token.shop_id}` +
    `&sign=${sign}`;

  const response = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  return response.json();
}