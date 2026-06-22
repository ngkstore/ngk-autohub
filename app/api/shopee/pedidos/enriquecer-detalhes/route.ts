import { NextRequest, NextResponse } from "next/server";
import { enriquecerPedidosPendentes } from "@/lib/shopee/enriquecerPedidos";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function enriquecer(limite: number) {
  try {
    const resultado = await enriquecerPedidosPendentes({ limite });

    return NextResponse.json({
      sucesso: true,
      mensagem:
        resultado.processados === 0
          ? "Nenhum pedido pendente de enriquecimento."
          : `${resultado.atualizados} pedido(s) enriquecido(s). Faltam ${resultado.restantes}.`,
      ...resultado,
    });
  } catch (error) {
    return NextResponse.json(
      {
        sucesso: false,
        erro:
          error instanceof Error
            ? error.message
            : "Erro desconhecido ao enriquecer pedidos.",
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  // Padrão maior no GET (usado pelo cron) para dar vazão ao volume.
  const limite = Number(request.nextUrl.searchParams.get("limite")) || 1000;
  return enriquecer(limite);
}

export async function POST(request: NextRequest) {
  let limite = 300;
  try {
    const body = await request.json();
    if (body?.limite) limite = Number(body.limite);
  } catch {
    // sem corpo — usa o padrão
  }
  return enriquecer(limite);
}
