import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    teste: "ROTA NOVA FUNCIONANDO",
    shopeePartnerId: process.env.SHOPEE_PARTNER_ID || null,
    possuiKey: !!process.env.SHOPEE_PARTNER_KEY,
    redirect: process.env.NEXT_PUBLIC_SHOPEE_REDIRECT_URL || null,
  });
}