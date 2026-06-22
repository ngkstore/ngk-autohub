import { NextRequest, NextResponse } from "next/server";
import { enriquecerEscrowPendentes } from "@/lib/shopee/enriquecerEscrow";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function enriquecer(limite: number) {
  try {
    const resultado = await enriquecerEscrowPendentes({ limite });

    return NextResponse.json({
      sucesso: true,
      mensagem:
        resultado.processados === 0
          ? "Nenhum pedido pendente de conciliação."
          : `${resultado.atualizados} pedido(s) conciliado(s). Faltam ${resultado.restantes}.`,
      ...resultado,
    });
  } catch (error) {
    return NextResponse.json(
      {
        sucesso: false,
        erro:
          error instanceof Error
            ? error.message
            : "Erro desconhecido ao conciliar pedidos.",
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  const limite = Number(request.nextUrl.searchParams.get("limite")) || 200;
  return enriquecer(limite);
}

export async function POST(request: NextRequest) {
  let limite = 150;
  try {
    const body = await request.json();
    if (body?.limite) limite = Number(body.limite);
  } catch {
    // usa o padrão
  }
  return enriquecer(limite);
}
