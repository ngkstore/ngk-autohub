import { NextResponse } from "next/server";
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

export async function GET() {
  try {
    const { data: configs, error } = await supabase
      .from("configuracoes")
      .select("*")
      .in("chave", [
        "shopee_partner_id",
        "shopee_partner_key",
        "shopee_redirect_url",
      ]);

    if (error) {
      return NextResponse.json(
        {
          sucesso: false,
          erro: error.message,
        },
        { status: 500 }
      );
    }

    const partnerId =
      configs?.find((c) => c.chave === "shopee_partner_id")?.valor ||
      process.env.SHOPEE_PARTNER_ID;

    const partnerKey =
      configs?.find((c) => c.chave === "shopee_partner_key")?.valor ||
      process.env.SHOPEE_PARTNER_KEY;

    const redirectUrl =
      configs?.find((c) => c.chave === "shopee_redirect_url")?.valor ||
      process.env.NEXT_PUBLIC_SHOPEE_REDIRECT_URL;

    if (!partnerId || !partnerKey) {
      return NextResponse.json(
        {
          sucesso: false,
          erro: "Partner ID e Partner Key da Shopee ainda não foram configurados.",
        },
        { status: 400 }
      );
    }

    const path = "/api/v2/shop/auth_partner";
    const timestamp = Math.floor(Date.now() / 1000);

    const sign = gerarAssinatura(
      String(partnerId),
      path,
      timestamp,
      String(partnerKey)
    );

    const baseUrl =
      process.env.SHOPEE_API_BASE_URL ||
      "https://partner.test-stable.shopeemobile.com";

    const authUrl = new URL(`${baseUrl}${path}`);

    authUrl.searchParams.set(
      "partner_id",
      String(partnerId)
    );

    authUrl.searchParams.set(
      "timestamp",
      String(timestamp)
    );

    authUrl.searchParams.set(
      "sign",
      sign
    );

    authUrl.searchParams.set(
      "redirect",
      String(redirectUrl)
    );

    return NextResponse.redirect(authUrl.toString());
  } catch (error) {
    return NextResponse.json(
      {
        sucesso: false,
        erro:
          error instanceof Error
            ? error.message
            : "Erro desconhecido",
      },
      { status: 500 }
    );
  }
}