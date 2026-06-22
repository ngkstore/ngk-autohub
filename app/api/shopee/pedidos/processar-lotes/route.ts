import { NextResponse } from "next/server";
import { processarLotesPendentes } from "@/lib/shopee/sincronizarPedidos";

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

export async function GET() {
  return processarLotes();
}

export async function POST() {
  return processarLotes();
}
