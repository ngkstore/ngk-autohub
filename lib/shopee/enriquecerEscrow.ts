import crypto from "crypto";
import { supabase } from "@/lib/supabase";

const BASE_URL_PADRAO = "https://partner.shopeemobile.com";

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

function gerarAssinaturaSimples(
  partnerId: string,
  path: string,
  timestamp: number,
  partnerKey: string
) {
  return crypto
    .createHmac("sha256", partnerKey)
    .update(`${partnerId}${path}${timestamp}`)
    .digest("hex");
}

type TokenLoja = {
  id: string;
  accessToken: string;
  refreshToken: string;
  shopId: string;
};

async function atualizarToken(params: {
  tokenId: string;
  refreshToken: string;
  shopId: string;
  partnerId: string;
  partnerKey: string;
  baseUrl: string;
}) {
  const path = "/api/v2/auth/access_token/get";
  const timestamp = Math.floor(Date.now() / 1000);
  const sign = gerarAssinaturaSimples(
    params.partnerId,
    path,
    timestamp,
    params.partnerKey
  );

  const url =
    `${params.baseUrl}${path}` +
    `?partner_id=${params.partnerId}` +
    `&timestamp=${timestamp}` +
    `&sign=${sign}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      refresh_token: params.refreshToken,
      partner_id: Number(params.partnerId),
      shop_id: Number(params.shopId),
    }),
  });

  const data = await response.json();

  if (!response.ok || data.error) {
    throw new Error(
      `Erro ao atualizar token Shopee: ${data?.error || "-"} | ${
        data?.message || "-"
      }`
    );
  }

  await supabase
    .from("marketplace_tokens")
    .update({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      shop_id: String(params.shopId),
      expire_in: data.expire_in,
      status: "ativo",
      atualizado_em: new Date().toISOString(),
    })
    .eq("id", params.tokenId);

  return {
    accessToken: data.access_token as string,
    refreshToken: data.refresh_token as string,
  };
}

async function obterTokenLoja(lojaId: string): Promise<TokenLoja> {
  const { data: token, error } = await supabase
    .from("marketplace_tokens")
    .select("*")
    .eq("loja_id", lojaId)
    .eq("marketplace", "shopee")
    .eq("status", "ativo")
    .limit(1)
    .single();

  if (error || !token) throw new Error("Token Shopee não encontrado.");
  if (!token.access_token || !token.refresh_token || !token.shop_id) {
    throw new Error("Token incompleto.");
  }

  return {
    id: token.id,
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    shopId: String(token.shop_id),
  };
}

function n(valor: unknown) {
  return Number(valor || 0);
}

type EscrowResposta = {
  order_income?: Record<string, unknown>;
  buyer_payment_info?: Record<string, unknown>;
};

// Busca o escrow de um pedido, com refresh de token automático.
async function buscarEscrow(params: {
  baseUrl: string;
  partnerId: string;
  partnerKey: string;
  token: TokenLoja;
  orderSn: string;
}): Promise<EscrowResposta | null> {
  const { baseUrl, partnerId, partnerKey, token, orderSn } = params;
  const path = "/api/v2/payment/get_escrow_detail";
  let tentativaRefresh = false;

  while (true) {
    const timestamp = Math.floor(Date.now() / 1000);
    const sign = gerarAssinatura(
      partnerId,
      path,
      timestamp,
      token.accessToken,
      token.shopId,
      partnerKey
    );

    const url =
      `${baseUrl}${path}` +
      `?partner_id=${partnerId}` +
      `&timestamp=${timestamp}` +
      `&access_token=${encodeURIComponent(token.accessToken)}` +
      `&shop_id=${token.shopId}` +
      `&sign=${sign}` +
      `&order_sn=${encodeURIComponent(orderSn)}`;

    const response = await fetch(url, { method: "GET", cache: "no-store" });
    const data = await response.json();

    const erroToken =
      data?.error === "invalid_access_token" ||
      String(data?.message || "").toLowerCase().includes("token");

    if ((!response.ok || data.error) && erroToken && !tentativaRefresh) {
      tentativaRefresh = true;
      const novo = await atualizarToken({
        tokenId: token.id,
        refreshToken: token.refreshToken,
        shopId: token.shopId,
        partnerId,
        partnerKey,
        baseUrl,
      });
      token.accessToken = novo.accessToken;
      token.refreshToken = novo.refreshToken;
      continue;
    }

    if (!response.ok || data.error) {
      throw new Error(
        `Erro Shopee get_escrow_detail: ${data?.error || "-"} | ${
          data?.message || "-"
        }`
      );
    }

    return (data.response as EscrowResposta) || null;
  }
}

export type ResultadoEscrow = {
  processados: number;
  atualizados: number;
  erros: number;
  restantes: number;
  mensagemErro?: string;
};

// Enriquece um lote de pedidos com os dados financeiros do escrow.
// "Vendas (= Pedidos Pagos)" = merchant_subtotal (após descontos do vendedor
// e da Shopee, sem frete). Também grava taxas e o líquido a receber.
export async function enriquecerEscrowPendentes({
  limite = 150,
}: { limite?: number } = {}): Promise<ResultadoEscrow> {
  const partnerId = process.env.SHOPEE_PARTNER_ID;
  const partnerKey = process.env.SHOPEE_PARTNER_KEY;
  const baseUrl = process.env.SHOPEE_API_BASE_URL || BASE_URL_PADRAO;

  if (!partnerId || !partnerKey) {
    throw new Error("Credenciais da Shopee não configuradas.");
  }

  // Pedidos pagos/válidos, reais, que ainda não tiveram o escrow puxado.
  const { data: pedidos } = await supabase
    .from("pedidos")
    .select("id, loja_id, pedido_externo_id")
    .eq("marketplace", "shopee")
    .eq("pedido_efetivado", true)
    .not("pedido_externo_id", "like", "SH-%")
    .is("escrow_atualizado_em", null)
    .limit(limite);

  if (!pedidos || pedidos.length === 0) {
    return { processados: 0, atualizados: 0, erros: 0, restantes: 0 };
  }

  let atualizados = 0;
  let erros = 0;
  let mensagemErro: string | undefined;
  const tokensPorLoja = new Map<string, TokenLoja>();

  for (const pedido of pedidos) {
    try {
      let token = tokensPorLoja.get(pedido.loja_id);
      if (!token) {
        token = await obterTokenLoja(pedido.loja_id);
        tokensPorLoja.set(pedido.loja_id, token);
      }

      const escrow = await buscarEscrow({
        baseUrl,
        partnerId,
        partnerKey,
        token,
        orderSn: pedido.pedido_externo_id,
      });

      const income = escrow?.order_income || {};
      const buyer = escrow?.buyer_payment_info || {};

      // "Vendas (Pedidos Pagos)": subtotal de mercadoria após todos os
      // descontos (vendedor + Shopee), sem frete.
      const vendas =
        buyer.merchant_subtotal != null
          ? n(buyer.merchant_subtotal)
          : n(income.order_selling_price);

      const { error: updateError } = await supabase
        .from("pedidos")
        .update({
          valor_total: vendas,
          valor_pago: n(buyer.buyer_total_amount ?? income.buyer_total_amount),
          valor_liquido: n(income.escrow_amount),
          taxa_comissao: n(income.commission_fee ?? income.net_commission_fee),
          taxa_servico: n(income.service_fee ?? income.net_service_fee),
          cupom_shopee: n(buyer.shopee_voucher ?? income.voucher_from_shopee),
          cupom_loja: n(buyer.seller_voucher ?? income.voucher_from_seller),
          frete: n(buyer.shipping_fee ?? income.buyer_paid_shipping_fee),
          desconto_vendedor: n(income.order_seller_discount),
          escrow_atualizado_em: new Date().toISOString(),
        })
        .eq("id", pedido.id);

      if (updateError) {
        erros++;
        mensagemErro = updateError.message;
      } else {
        atualizados++;
      }
    } catch (e) {
      erros++;
      mensagemErro = e instanceof Error ? e.message : "Erro desconhecido.";
    }
  }

  const { count } = await supabase
    .from("pedidos")
    .select("id", { count: "exact", head: true })
    .eq("marketplace", "shopee")
    .eq("pedido_efetivado", true)
    .not("pedido_externo_id", "like", "SH-%")
    .is("escrow_atualizado_em", null);

  return {
    processados: pedidos.length,
    atualizados,
    erros,
    restantes: count ?? 0,
    mensagemErro,
  };
}
