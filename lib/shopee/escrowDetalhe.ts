import crypto from "crypto";
import { supabase } from "@/lib/supabase";

const BASE_URL_PADRAO = "https://partner.shopeemobile.com";

export type EscrowDetalhe = {
  income: Record<string, unknown>;
  buyer: Record<string, unknown>;
  erro?: string;
};

// Busca o detalhamento financeiro completo (get_escrow_detail) de um pedido.
export async function buscarEscrowDetalhe(
  orderSn: string
): Promise<EscrowDetalhe> {
  const partnerId = process.env.SHOPEE_PARTNER_ID;
  const partnerKey = process.env.SHOPEE_PARTNER_KEY;
  const baseUrl = process.env.SHOPEE_API_BASE_URL || BASE_URL_PADRAO;

  if (!partnerId || !partnerKey) {
    return { income: {}, buyer: {}, erro: "Credenciais Shopee ausentes." };
  }

  const { data: token } = await supabase
    .from("marketplace_tokens")
    .select("access_token, shop_id")
    .eq("marketplace", "shopee")
    .eq("status", "ativo")
    .limit(1)
    .single();

  if (!token?.access_token || !token?.shop_id) {
    return { income: {}, buyer: {}, erro: "Token Shopee ativo não encontrado." };
  }

  const path = "/api/v2/payment/get_escrow_detail";
  const timestamp = Math.floor(Date.now() / 1000);
  const shopId = String(token.shop_id);

  const sign = crypto
    .createHmac("sha256", partnerKey)
    .update(`${partnerId}${path}${timestamp}${token.access_token}${shopId}`)
    .digest("hex");

  const url =
    `${baseUrl}${path}` +
    `?partner_id=${partnerId}` +
    `&timestamp=${timestamp}` +
    `&access_token=${encodeURIComponent(token.access_token)}` +
    `&shop_id=${shopId}` +
    `&sign=${sign}` +
    `&order_sn=${encodeURIComponent(orderSn)}`;

  try {
    const response = await fetch(url, { method: "GET", cache: "no-store" });
    const data = await response.json();
    if (data?.error) {
      return { income: {}, buyer: {}, erro: `${data.error} | ${data.message || ""}` };
    }
    return {
      income: (data.response?.order_income as Record<string, unknown>) || {},
      buyer: (data.response?.buyer_payment_info as Record<string, unknown>) || {},
    };
  } catch (e) {
    return {
      income: {},
      buyer: {},
      erro: e instanceof Error ? e.message : "Erro ao buscar escrow.",
    };
  }
}
