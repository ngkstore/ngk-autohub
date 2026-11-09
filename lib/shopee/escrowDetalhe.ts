import crypto from "crypto";
import { supabase } from "@/lib/supabase";

const BASE_URL_PADRAO = "https://partner.shopeemobile.com";

export type EscrowDetalhe = {
  income: Record<string, unknown>;
  buyer: Record<string, unknown>;
  lojaId?: string | null;
  erro?: string;
};

// Busca o detalhamento financeiro completo (get_escrow_detail) de um pedido.
// Multi-loja: usa o token da LOJA DO PEDIDO (antes pegava o primeiro token ativo,
// o que dava "order_not_found" para pedidos de outra loja). Se a loja não for
// informada, descobre pelo order_sn em pedidos.
export async function buscarEscrowDetalhe(
  orderSn: string,
  lojaId?: string | null
): Promise<EscrowDetalhe> {
  const partnerId = process.env.SHOPEE_PARTNER_ID;
  const partnerKey = process.env.SHOPEE_PARTNER_KEY;
  const baseUrl = process.env.SHOPEE_API_BASE_URL || BASE_URL_PADRAO;

  if (!partnerId || !partnerKey) {
    return { income: {}, buyer: {}, erro: "Credenciais Shopee ausentes." };
  }

  let loja = lojaId ?? null;
  if (!loja) {
    const { data: ped } = await supabase
      .from("pedidos")
      .select("loja_id")
      .eq("marketplace", "shopee")
      .eq("pedido_externo_id", orderSn)
      .maybeSingle();
    loja = (ped?.loja_id as string | undefined) ?? null;
  }
  if (!loja) {
    return { income: {}, buyer: {}, erro: "Pedido não encontrado no AutoHub (loja desconhecida)." };
  }

  const { data: token } = await supabase
    .from("marketplace_tokens")
    .select("access_token, shop_id")
    .eq("marketplace", "shopee")
    .eq("status", "ativo")
    .eq("loja_id", loja)
    .limit(1)
    .maybeSingle();

  if (!token?.access_token || !token?.shop_id) {
    return { income: {}, buyer: {}, lojaId: loja, erro: "Loja do pedido sem token Shopee ativo." };
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
      return { income: {}, buyer: {}, lojaId: loja, erro: `${data.error} | ${data.message || ""}` };
    }
    return {
      income: (data.response?.order_income as Record<string, unknown>) || {},
      buyer: (data.response?.buyer_payment_info as Record<string, unknown>) || {},
      lojaId: loja,
    };
  } catch (e) {
    return {
      income: {},
      buyer: {},
      lojaId: loja,
      erro: e instanceof Error ? e.message : "Erro ao buscar escrow.",
    };
  }
}
