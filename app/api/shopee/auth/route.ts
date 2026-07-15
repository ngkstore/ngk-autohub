import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { supabase } from "@/lib/supabase";

const CHAVE_PENDENTE = "oauth_loja_pendente";

async function salvarLojaPendente(lojaId: string) {
  const { data } = await supabase
    .from("configuracoes")
    .select("chave")
    .eq("chave", CHAVE_PENDENTE)
    .maybeSingle();
  const linha = {
    chave: CHAVE_PENDENTE,
    valor: lojaId,
    atualizado_em: new Date().toISOString(),
  };
  if (data) {
    await supabase.from("configuracoes").update(linha).eq("chave", CHAVE_PENDENTE);
  } else {
    await supabase.from("configuracoes").insert(linha);
  }
}

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
    const partnerId = process.env.SHOPEE_PARTNER_ID;
    const partnerKey = process.env.SHOPEE_PARTNER_KEY;
    const redirectUrl = process.env.NEXT_PUBLIC_SHOPEE_REDIRECT_URL;

    // Qual loja estamos conectando? Vem de /api/shopee/auth?loja=<id>.
    // Repassamos no redirect para o callback amarrar o token à loja certa.
    const lojaId = request.nextUrl.searchParams.get("loja");

    if (!partnerId || !partnerKey || !redirectUrl) {
      return NextResponse.json(
        {
          sucesso: false,
          erro: "Credenciais Shopee não configuradas na Vercel.",
          debug: {
            temPartnerId: !!partnerId,
            temPartnerKey: !!partnerKey,
            temRedirectUrl: !!redirectUrl,
          },
        },
        { status: 400 }
      );
    }

    const path = "/api/v2/shop/auth_partner";
    const timestamp = Math.floor(Date.now() / 1000);
    const sign = gerarAssinatura(partnerId, path, timestamp, partnerKey);

    const baseUrl =
      process.env.SHOPEE_API_BASE_URL || "https://partner.shopeemobile.com";

    // Guarda no banco qual loja está sendo conectada (fonte confiável no callback,
    // caso a Shopee não preserve a query do redirect). Também anexa ?loja= como reforço.
    let redirect = redirectUrl;
    if (lojaId) {
      await salvarLojaPendente(lojaId);
      const u = new URL(redirectUrl);
      u.searchParams.set("loja", lojaId);
      redirect = u.toString();
    }

    const authUrl = new URL(`${baseUrl}${path}`);

    authUrl.searchParams.set("partner_id", partnerId);
    authUrl.searchParams.set("timestamp", String(timestamp));
    authUrl.searchParams.set("sign", sign);
    authUrl.searchParams.set("redirect", redirect);

    return NextResponse.redirect(authUrl.toString());
  } catch (error) {
    return NextResponse.json(
      {
        sucesso: false,
        erro:
          error instanceof Error
            ? error.message
            : "Erro desconhecido ao gerar autorização Shopee.",
      },
      { status: 500 }
    );
  }
}