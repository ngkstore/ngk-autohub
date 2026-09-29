import { NextRequest, NextResponse } from "next/server";
import { renovarTokensTikTok } from "@/lib/tiktok/token";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Cron diário: renova o access_token do TikTok Shop antes de vencer (7 dias).
// ?forcar=1 renova mesmo que ainda esteja válido.
export async function GET(request: NextRequest) {
  try {
    const forcar = request.nextUrl.searchParams.get("forcar") === "1";
    const r = await renovarTokensTikTok(forcar);
    return NextResponse.json({ sucesso: r.lojas.every((l) => !l.erro), ...r });
  } catch (error) {
    return NextResponse.json(
      { sucesso: false, erro: error instanceof Error ? error.message : "Erro ao renovar token TikTok." },
      { status: 500 }
    );
  }
}
