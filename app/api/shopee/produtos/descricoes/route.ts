import { NextRequest, NextResponse } from "next/server";
import { enriquecerDescricoesPendentes } from "@/lib/shopee/enriquecerProdutos";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function rodar(limite: number) {
  try {
    const resultado = await enriquecerDescricoesPendentes({ limite });
    return NextResponse.json({
      sucesso: !resultado.erro,
      mensagem:
        resultado.processados === 0
          ? "Nenhum produto pendente de descrição."
          : `${resultado.atualizados} descrição(ões) atualizada(s). Faltam ${resultado.restantes}.`,
      ...resultado,
    });
  } catch (error) {
    return NextResponse.json(
      {
        sucesso: false,
        erro:
          error instanceof Error
            ? error.message
            : "Erro ao buscar descrições.",
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  const limite = Number(request.nextUrl.searchParams.get("limite")) || 200;
  return rodar(limite);
}

export async function POST(request: NextRequest) {
  let limite = 200;
  try {
    const body = await request.json();
    if (body?.limite) limite = Number(body.limite);
  } catch {
    // padrão
  }
  return rodar(limite);
}
