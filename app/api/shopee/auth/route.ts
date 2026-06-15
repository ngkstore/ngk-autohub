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
    const { data: configs } = await supabase
      .from("configuracoes")
      .select("*")
      .in("chave", [
        "shopee_partner_id",
        "shopee_partner_key",
        "shopee_redirect_url",
      ]);

    const partnerIdSupabase = configs?.find(
      (item) => item.chave === "shopee_partner_id"
    )?.valor;

    const partnerKeySupabase = configs?.find(
      (item) => item.chave === "shopee_partner_key"
    )?.valor;

    const redirectSupabase = configs?.find(
      (item) => item.chave === "shopee_redirect_url"
    )?.valor;

    const partnerId =
      process.env.SHOPEE_PARTNER_ID || partnerIdSupabase;

    const partnerKey =
      process.env.SHOPEE_PARTNER_KEY || partnerKeySupabase;

    const redirectUrl =
      process.env.NEXT_PUBLIC_SHOPEE_REDIRECT_URL ||
      redirectSupabase ||
      "https://ngk-autohub-nhwsisteg-ngkstores-projects.vercel.app/api/shopee/callback";

    if (!partnerId || !partnerKey) {
      return NextResponse.json(
        {
          sucesso: false,
          erro: "Partner ID e Partner Key da Shopee ainda não foram configurados.",
          debug: {
            temPartnerIdEnv: !!process.env.SHOPEE_PARTNER_ID,
            temPartnerKeyEnv: !!process.env.SHOPEE_PARTNER_KEY,
            temPartnerIdSupabase: !!partnerIdSupabase,
            temPartnerKeySupabase: !!partnerKeySupabase,
          },
        },
        { status: 400 }
      );
    }

    const path = "/api/v2/shop/auth_partner";
    const timestamp = Math.floor(Date.now() / 1000);

    const sign = gerarAssinatura(partnerId, path, timestamp, partnerKey);

    const authUrl = new URL(`https://partner.shopeemobile.com${path}`);

    authUrl.searchParams.set("partner_id", partnerId);
    authUrl.searchParams.set("timestamp", String(timestamp));
    authUrl.searchParams.set("sign", sign);
    authUrl.searchParams.set("redirect", redirectUrl);

    return NextResponse.redirect(authUrl.toString());
  } catch (error) {
    return NextResponse.json(
      {
        sucesso: false,
        erro:
          error instanceof Error
            ? error.message
            : "Erro desconhecido ao gerar link de autorização Shopee.",
      },
      { status: 500 }
    );
  }
}