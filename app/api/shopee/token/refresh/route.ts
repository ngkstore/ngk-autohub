import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { supabase } from "@/lib/supabase";

function gerarAssinatura(
  partnerId: string,
  path: string,
  timestamp: number,
  partnerKey: string
) {
  const baseString = `${partnerId}${path}${timestamp}`;

  return crypto
    .createHmac("sha256", partnerKey)
    .update(baseString)
    .digest("hex");
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const lojaId = body.lojaId;

    const partnerId = process.env.SHOPEE_PARTNER_ID;
    const partnerKey = process.env.SHOPEE_PARTNER_KEY;
    const baseUrl =
      process.env.SHOPEE_API_BASE_URL || "https://partner.shopeemobile.com";

    if (!partnerId || !partnerKey) {
      return NextResponse.json(
        {
          sucesso: false,
          erro: "Credenciais Shopee não configuradas na Vercel.",
        },
        { status: 500 }
      );
    }

    let query = supabase.from("marketplace_tokens").select("*");

    if (lojaId) {
      query = query.eq("loja_id", lojaId);
    }

    const { data: token, error: tokenError } = await query
      .limit(1)
      .single();

    if (tokenError || !token) {
      return NextResponse.json(
        {
          sucesso: false,
          erro: "Token Shopee não encontrado no Supabase.",
          detalhe: tokenError?.message,
        },
        { status: 404 }
      );
    }

    const refreshToken =
      token.refresh_token || token["token_de_atualização"];

    const shopId = token.shop_id || token.id_da_loja;

    if (!refreshToken || !shopId) {
      return NextResponse.json(
        {
          sucesso: false,
          erro: "Refresh token ou shop_id ausente.",
          debug: {
            refreshTokenEncontrado: !!refreshToken,
            shopIdEncontrado: !!shopId,
            tokenColumns: Object.keys(token),
          },
        },
        { status: 400 }
      );
    }

    const path = "/api/v2/auth/access_token/get";
    const timestamp = Math.floor(Date.now() / 1000);
    const sign = gerarAssinatura(
      String(partnerId),
      path,
      timestamp,
      String(partnerKey)
    );

    const url =
      `${baseUrl}${path}` +
      `?partner_id=${partnerId}` +
      `&timestamp=${timestamp}` +
      `&sign=${sign}`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        refresh_token: refreshToken,
        partner_id: Number(partnerId),
        shop_id: Number(shopId),
      }),
    });

    const data = await response.json();

    if (!response.ok || data.error) {
      return NextResponse.json(
        {
          sucesso: false,
          erro: "Erro ao atualizar token Shopee.",
          detalhe: data,
        },
        { status: 500 }
      );
    }

    const { error: updateError } = await supabase
      .from("marketplace_tokens")
      .update({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        shop_id: String(shopId),
        expire_in: data.expire_in,
        status: "ativo",
        atualizado_em: new Date().toISOString(),
      })
      .eq("id", token.id);

    if (updateError) {
      return NextResponse.json(
        {
          sucesso: false,
          erro: "Token atualizado na Shopee, mas falhou ao salvar no Supabase.",
          detalhe: updateError.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      sucesso: true,
      mensagem: "Token Shopee atualizado com sucesso.",
      shopId,
      expireIn: data.expire_in,
    });
  } catch (error) {
    return NextResponse.json(
      {
        sucesso: false,
        erro:
          error instanceof Error
            ? error.message
            : "Erro desconhecido ao atualizar token Shopee.",
      },
      { status: 500 }
    );
  }
}