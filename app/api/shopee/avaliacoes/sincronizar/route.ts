import { NextRequest, NextResponse } from "next/server";
import { sincronizarAvaliacoesPagina } from "@/lib/shopee/sincronizarAvaliacoes";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    let cursor = "";
    let maxPaginas = 40;

    try {
      const body = await request.json();
      if (typeof body?.cursor === "string") cursor = body.cursor;
      if (body?.maxPaginas) maxPaginas = Number(body.maxPaginas);
    } catch {
      // sem corpo — usa padrões
    }

    const resultado = await sincronizarAvaliacoesPagina({ cursor, maxPaginas });

    return NextResponse.json({
      sucesso: !resultado.erro,
      ...resultado,
    });
  } catch (error) {
    return NextResponse.json(
      {
        sucesso: false,
        erro:
          error instanceof Error
            ? error.message
            : "Erro desconhecido ao sincronizar avaliações.",
      },
      { status: 500 }
    );
  }
}

// GET usado pelo cron: sincroniza as páginas mais recentes (avaliações novas).
export async function GET(request: NextRequest) {
  const maxPaginas =
    Number(request.nextUrl.searchParams.get("maxPaginas")) || 10;

  try {
    const resultado = await sincronizarAvaliacoesPagina({
      cursor: "",
      maxPaginas,
    });

    return NextResponse.json({ sucesso: !resultado.erro, ...resultado });
  } catch (error) {
    return NextResponse.json(
      {
        sucesso: false,
        erro:
          error instanceof Error
            ? error.message
            : "Erro desconhecido ao sincronizar avaliações.",
      },
      { status: 500 }
    );
  }
}
