import { NextRequest, NextResponse } from "next/server";
import { sincronizarPedidosTikTok } from "@/lib/tiktok/pedidos";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Sincroniza os pedidos do TikTok Shop. GET (cron) e POST (manual/botão).
async function rodar(maxPaginas: number, desdeUnix?: number, ateUnix?: number, pageSize = 50) {
  try {
    const resultados = await sincronizarPedidosTikTok(maxPaginas, desdeUnix, ateUnix, pageSize);
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

// POST (manual/backfill): puxa mais páginas, último ano. Aceita uma janela
// fechada pra tapar buracos por fatias: ?desde=YYYY-MM-DD&ate=YYYY-MM-DD
// (&paginas=30&tamanho=100). Sem parâmetros: último ano, 30 páginas.
export async function POST(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const unix = (s: string | null) => (s ? Math.floor(new Date(`${s}T00:00:00-03:00`).getTime() / 1000) : undefined);
  const desde = unix(sp.get("desde")) ?? Math.floor(Date.now() / 1000) - 365 * 86400;
  const ate = unix(sp.get("ate"));
  const paginas = Number(sp.get("paginas") || 30);
  const tamanho = Math.min(100, Number(sp.get("tamanho") || 50));
  return rodar(paginas, desde, ate, tamanho);
}
