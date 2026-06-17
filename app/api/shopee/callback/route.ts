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

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;

    const code = searchParams.get("code");
    const shopId = searchParams.get("shop_id");

    if (!code) {
      return NextResponse.json(
        {
          sucesso: false,
          erro: "Código de autorização não recebido pela Shopee.",
        },
        { status: 400 }
      );
    }

    if (!shopId) {
      return NextResponse.json(
        {
          sucesso: false,
          erro: "Shop ID não recebido pela Shopee.",
        },
        { status: 400 }
      );
    }

    const partnerId = process.env.SHOPEE_PARTNER_ID;
    const partnerKey = process.env.SHOPEE_PARTNER_KEY;
    const baseUrl =
      process.env.SHOPEE_API_BASE_URL || "https://partner.shopeemobile.com";

    if (!partnerId || !partnerKey) {
      return NextResponse.json(
        {
          sucesso: false,
          erro: "Partner ID ou Partner Key da Shopee não configurados.",
        },
        { status: 500 }
      );
    }

    const { data: lojaNgk, error: lojaError } = await supabase
      .from("lojas")
      .select("id, apelido, marketplace")
      .ilike("apelido", "%NGK%")
      .ilike("marketplace", "%shopee%")
      .single();

    if (lojaError || !lojaNgk) {
      return NextResponse.json(
        {
          sucesso: false,
          erro: "Loja NGK Shopee não encontrada no Supabase.",
          detalhe: lojaError?.message,
        },
        { status: 404 }
      );
    }

    const path = "/api/v2/auth/token/get";
    const timestamp = Math.floor(Date.now() / 1000);
    const sign = gerarAssinatura(partnerId, path, timestamp, partnerKey);

    const tokenUrl = `${baseUrl}${path}?partner_id=${partnerId}&timestamp=${timestamp}&sign=${sign}`;

    const response = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        code,
        shop_id: Number(shopId),
        partner_id: Number(partnerId),
      }),
    });

    const tokenData = await response.json();

    if (!response.ok || tokenData.error) {
      return NextResponse.json(
        {
          sucesso: false,
          erro: "Erro ao trocar code por token na Shopee.",
          detalhe: tokenData,
        },
        { status: 500 }
      );
    }

    await supabase
      .from("marketplace_tokens")
      .delete()
      .eq("id_da_loja", Number(shopId));

    await supabase
      .from("marketplace_tokens")
      .delete()
      .eq("loja_id", lojaNgk.id);

    const { error: tokenError } = await supabase
      .from("marketplace_tokens")
      .insert({
        loja_id: lojaNgk.id,
        mercado: "Shopee",
        token_de_acesso: tokenData.access_token,
        token_de_atualização: tokenData.refresh_token,
        expirar_em: tokenData.expire_in,
        id_da_loja: Number(shopId),
        status: "ativo",
        atualizado_em: new Date().toISOString(),
      });

    if (tokenError) {
      return NextResponse.json(
        {
          sucesso: false,
          erro: "Token recebido, mas falhou ao salvar no Supabase.",
          detalhe: tokenError.message,
          tokenData,
        },
        { status: 500 }
      );
    }

    await supabase.from("sincronizacoes").insert({
      loja_id: lojaNgk.id,
      marketplace: "shopee",
      tipo: "oauth",
      status: "sucesso",
      registros_importados: 1,
      mensagem: `Loja Shopee conectada com sucesso. Shop ID: ${shopId}.`,
      iniciado_em: new Date().toISOString(),
      finalizado_em: new Date().toISOString(),
    });

    return NextResponse.redirect(
      new URL("/integracoes?shopee=conectada", request.url)
    );
  } catch (error) {
    return NextResponse.json(
      {
        sucesso: false,
        erro:
          error instanceof Error
            ? error.message
            : "Erro desconhecido no callback da Shopee.",
      },
      { status: 500 }
    );
  }
}