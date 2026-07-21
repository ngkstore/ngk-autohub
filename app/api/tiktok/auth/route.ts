import { NextRequest, NextResponse } from "next/server";
import { TIKTOK_SERVICE_ID } from "@/lib/tiktok/client";

export const dynamic = "force-dynamic";

// Manda o usuário pra tela de autorização do TikTok Shop.
// ?loja=<id> vai no state para o callback amarrar o token à loja certa.
export async function GET(request: NextRequest) {
  const lojaId = request.nextUrl.searchParams.get("loja") || "";

  const url = new URL("https://services.tiktokshop.com/open/authorize");
  url.searchParams.set("service_id", TIKTOK_SERVICE_ID);
  if (lojaId) url.searchParams.set("state", lojaId);

  return NextResponse.redirect(url.toString());
}
