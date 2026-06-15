import { NextResponse } from "next/server";
import { gerarAlertasAutomaticos } from "@/lib/alertas";

export async function POST() {
  try {
    const resultado = await gerarAlertasAutomaticos();

    return NextResponse.json(resultado);
  } catch (error) {
    return NextResponse.json(
      {
        sucesso: false,
        erro:
          error instanceof Error
            ? error.message
            : "Erro ao gerar alertas.",
      },
      { status: 500 }
    );
  }
}