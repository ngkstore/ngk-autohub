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

// Diagnóstico: busca a primeira página de avaliações (get_comment) e devolve o
// JSON cru, para confirmarmos os nomes exatos dos campos (comment_id, rating,
// comentário, cliente, item, resposta já existente).
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

    const path = "/api/v2/product/get_comment";
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

    const pageSize = request.nextUrl.searchParams.get("page_size") || "20";

    const url = new URL(`${BASE_URL}${path}`);
    url.searchParams.set("partner_id", String(partnerId));
    url.searchParams.set("timestamp", String(timestamp));
    url.searchParams.set("access_token", accessToken);
    url.searchParams.set("shop_id", shopId);
    url.searchParams.set("sign", sign);
    url.searchParams.set("cursor", "");
    url.searchParams.set("page_size", pageSize);

    const response = await fetch(url.toString(), {
      method: "GET",
      cache: "no-store",
    });

    const resultado = await response.json();

    const lista = resultado?.response?.comment_list ||
      resultado?.response?.item_comment_list ||
      [];

    return NextResponse.json({
      sucesso: !resultado?.error,
      total_na_pagina: Array.isArray(lista) ? lista.length : 0,
      tem_mais: resultado?.response?.more ?? null,
      primeira_avaliacao: Array.isArray(lista) ? lista[0] ?? null : null,
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
