import { NextRequest, NextResponse } from "next/server";
import { processarLotesPendentes } from "@/lib/shopee/sincronizarPedidos";
import { autorizar } from "@/lib/autorizacao";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function processarLotes() {
  try {
    const { lotesProcessados, totalPedidos, resultados } =
      await processarLotesPendentes();

    if (lotesProcessados === 0) {
      return NextResponse.json({
        sucesso: true,
        mensagem: "Nenhum lote pendente para processar.",
        lotesProcessados: 0,
        totalPedidos: 0,
      });
    }

    return NextResponse.json({
      sucesso: true,
      mensagem: `${lotesProcessados} lote(s) processado(s), ${totalPedidos} pedidos sincronizados.`,
      lotesProcessados,
      totalPedidos,
      resultados,
    });
  } catch (error) {
    return NextResponse.json(
      {
        sucesso: false,
        erro:
          error instanceof Error
            ? error.message
            : "Erro desconhecido ao processar lotes.",
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  // Cron (Bearer CRON_SECRET) ou usuário com acesso à loja; em lote só cron/admin.
  const autz = await autorizar(request);
  if (!autz.ok) return autz.resposta;
  return processarLotes();
}

export async function POST() {
  return processarLotes();
}
