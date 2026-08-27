import { NextRequest, NextResponse } from "next/server";
import { processarLotesBackfill } from "@/lib/shopee/sincronizarPedidos";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Drena a fila do BACKFILL histórico (tipo='pedidos_backfill'), separada da fila
// ao vivo. ?max=N controla quantos lotes por chamada (padrão 3, baixo de
// propósito pra não estourar o rate limit da Shopee nem competir com o dia a
// dia). Acionado manualmente por enquanto (Bearer CRON_SECRET); depois pode
// virar cron lento.
async function rodar(max: number) {
  try {
    const { lotesProcessados, totalPedidos, resultados } =
      await processarLotesBackfill({ maxLotes: max });
    return NextResponse.json({
      sucesso: true,
      mensagem:
        lotesProcessados === 0
          ? "Nenhum lote de backfill pendente."
          : `${lotesProcessados} lote(s) de backfill processado(s), ${totalPedidos} order_sn.`,
      lotesProcessados,
      totalPedidos,
      resultados,
    });
  } catch (error) {
    return NextResponse.json(
      { sucesso: false, erro: error instanceof Error ? error.message : "Erro desconhecido." },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  const max = Math.min(20, Math.max(1, Number(request.nextUrl.searchParams.get("max")) || 3));
  return rodar(max);
}

export async function POST(request: NextRequest) {
  const max = Math.min(20, Math.max(1, Number(request.nextUrl.searchParams.get("max")) || 3));
  return rodar(max);
}
