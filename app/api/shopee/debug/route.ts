import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    SHOPEE_PARTNER_ID: process.env.SHOPEE_PARTNER_ID,
    TEM_PARTNER_KEY: !!process.env.SHOPEE_PARTNER_KEY,
    NEXT_PUBLIC_SHOPEE_REDIRECT_URL:
      process.env.NEXT_PUBLIC_SHOPEE_REDIRECT_URL,
    SHOPEE_API_BASE_URL: process.env.SHOPEE_API_BASE_URL,
  });
}