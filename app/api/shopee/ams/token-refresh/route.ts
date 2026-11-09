import { NextRequest, NextResponse } from "next/server";
import { renovarTokensAms } from "@/lib/shopee/ams";
import { autorizar } from "@/lib/autorizacao";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Cron diário: renova os tokens do app de afiliados (o refresh_token da Shopee
// vale ~30 dias; sem uso ele morreria em silêncio — lição do TikTok em 28/07).
export async function GET(request: NextRequest) {
  // Cron (Bearer CRON_SECRET) ou usuário com acesso à loja; em lote só cron/admin.
  const autz = await autorizar(request);
  if (!autz.ok) return autz.resposta;
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
