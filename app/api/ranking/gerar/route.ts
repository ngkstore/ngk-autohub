import { NextResponse } from "next/server";
import { gerarRankingProdutos } from "@/lib/ranking";

export async function POST() {
  try {
    const resultado = await gerarRankingProdutos();

    return NextResponse.json(resultado);
  } catch (error) {
    return NextResponse.json(
      {
        sucesso: false,
        erro:
          error instanceof Error
            ? error.message
            : "Erro ao gerar ranking de produtos.",
      },
      { status: 500 }
    );
  }
}