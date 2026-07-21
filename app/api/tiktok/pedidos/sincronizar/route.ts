import { NextResponse } from "next/server";
import { sincronizarPedidosTikTok } from "@/lib/tiktok/pedidos";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Sincroniza os pedidos do TikTok Shop. GET (cron) e POST (manual/botão).
async function rodar(maxPaginas: number, desdeUnix?: number) {
  try {
    const resultados = await sincronizarPedidosTikTok(maxPaginas, desdeUnix);
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

// GET (cron): só os recentes (últimos ~120 dias), rápido.
export async function GET() {
  const desde = Math.floor(Date.now() / 1000) - 120 * 86400;
  return rodar(4, desde);
}

// POST (manual/backfill): puxa mais páginas, último ano.
export async function POST() {
  const desde = Math.floor(Date.now() / 1000) - 365 * 86400;
  return rodar(30, desde);
}
