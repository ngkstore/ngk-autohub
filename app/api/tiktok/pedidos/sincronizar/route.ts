import { NextResponse } from "next/server";
import { sincronizarPedidosTikTok } from "@/lib/tiktok/pedidos";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Sincroniza os pedidos do TikTok Shop. GET (cron) e POST (manual/botão).
async function rodar() {
  try {
    const resultados = await sincronizarPedidosTikTok();
    return NextResponse.json({
      sucesso: resultados.every((r) => !r.erro),
      lojas: resultados,
    });
  } catch (error) {
    return NextResponse.json(
      {
        sucesso: false,
        erro: error instanceof Error ? error.message : "Erro ao sincronizar pedidos TikTok.",
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return rodar();
}
export async function POST() {
  return rodar();
}
