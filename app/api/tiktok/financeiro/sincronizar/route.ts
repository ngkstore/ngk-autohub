import { NextRequest, NextResponse } from "next/server";
import { sincronizarFinanceiroTikTok } from "@/lib/tiktok/financeiro";
import { autorizar } from "@/lib/autorizacao";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Finanças TikTok: extratos + transações → colunas financeiras do pedido.
// GET (cron, de hora em hora) e POST (manual). Parâmetros:
//   ?loja=<id>  ?desde=YYYY-MM-DD (backfill)  ?max=<extratos por rodada>
async function rodar(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  try {
    const lojas = await sincronizarFinanceiroTikTok({
      lojaId: sp.get("loja") || undefined,
      desde: sp.get("desde") || undefined,
      maxExtratos: Number(sp.get("max") || 60),
    });
    return NextResponse.json({ sucesso: lojas.every((l) => !l.erro), lojas });
  } catch (error) {
    return NextResponse.json(
      { sucesso: false, erro: error instanceof Error ? error.message : "Erro no financeiro TikTok." },
      { status: 500 }
    );
  }
}
export async function GET(request: NextRequest) {
  // Cron (Bearer CRON_SECRET) ou admin; em lote não tem loja no pedido.
  const autz = await autorizar(request);
  if (!autz.ok) return autz.resposta;
  return rodar(request);
}
export async function POST(request: NextRequest) { return rodar(request); }
