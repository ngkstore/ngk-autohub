import { NextResponse } from "next/server";
import { renovarTokensAms } from "@/lib/shopee/ams";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Cron diário: renova os tokens do app de afiliados (o refresh_token da Shopee
// vale ~30 dias; sem uso ele morreria em silêncio — lição do TikTok em 28/07).
export async function GET() {
  try {
    const lojas = await renovarTokensAms();
    return NextResponse.json({ sucesso: lojas.every((l) => l.ok), lojas });
  } catch (error) {
    return NextResponse.json(
      { sucesso: false, erro: error instanceof Error ? error.message : "Erro ao renovar tokens AMS" },
      { status: 500 }
    );
  }
}
