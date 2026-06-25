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

async function chamarShopee(
  path: string,
  params: Record<string, string>,
  token: { accessToken: string; shopId: string }
) {
  const partnerId = process.env.SHOPEE_PARTNER_ID!;
  const partnerKey = process.env.SHOPEE_PARTNER_KEY!;
  const timestamp = Math.floor(Date.now() / 1000);

  const sign = gerarAssinatura(
    partnerId,
    path,
    timestamp,
    token.accessToken,
    token.shopId,
    partnerKey
  );

  const url = new URL(`${BASE_URL}${path}`);
  url.searchParams.set("partner_id", partnerId);
  url.searchParams.set("timestamp", String(timestamp));
  url.searchParams.set("access_token", token.accessToken);
  url.searchParams.set("shop_id", token.shopId);
  url.searchParams.set("sign", sign);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const response = await fetch(url.toString(), {
    method: "GET",
    cache: "no-store",
  });
  return response.json();
}

// Diagnóstico do Chat (sellerchat): lista conversas e lê as mensagens da
// primeira, para confirmarmos o acesso e a estrutura real dos campos.
export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const tipo = sp.get("type") || "all";
    const direction = sp.get("direction") || "latest";
    const pageSize = sp.get("page_size") || "10";

    const partnerId = process.env.SHOPEE_PARTNER_ID;
    const partnerKey = process.env.SHOPEE_PARTNER_KEY;
    if (!partnerId || !partnerKey) {
      return NextResponse.json(
        { sucesso: false, erro: "Credenciais Shopee não configuradas." },
        { status: 500 }
      );
    }

    const { data: tokenRow } = await supabase
      .from("marketplace_tokens")
      .select("access_token, shop_id")
      .eq("marketplace", "shopee")
      .eq("status", "ativo")
      .limit(1)
      .single();

    if (!tokenRow?.access_token || !tokenRow?.shop_id) {
      return NextResponse.json(
        { sucesso: false, erro: "Nenhuma loja Shopee com token ativo." },
        { status: 400 }
      );
    }

    const token = {
      accessToken: tokenRow.access_token,
      shopId: String(tokenRow.shop_id),
    };

    // 1) Lista de conversas
    const conversas = await chamarShopee(
      "/api/v2/sellerchat/get_conversation_list",
      { type: tipo, direction, page_size: pageSize },
      token
    );

    const lista =
      conversas?.response?.conversations ||
      conversas?.response?.conversation_list ||
      [];

    const primeira = Array.isArray(lista) ? lista[0] : null;
    const conversationId =
      primeira?.conversation_id || primeira?.conversation?.conversation_id;

    // 2) Mensagens da primeira conversa
    let mensagens: unknown = null;
    if (conversationId) {
      mensagens = await chamarShopee(
        "/api/v2/sellerchat/get_message",
        { conversation_id: String(conversationId), page_size: "10" },
        token
      );
    }

    return NextResponse.json({
      sucesso: !conversas?.error,
      erro_lista: conversas?.error || null,
      total_conversas: Array.isArray(lista) ? lista.length : 0,
      primeira_conversa: primeira,
      mensagens_primeira_conversa: mensagens,
      retorno_bruto_lista: conversas,
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
