import { NextRequest, NextResponse } from "next/server";
import { sincronizarCarteiraLoja } from "@/lib/shopee/carteira";
import { listarLojasShopeeAtivas, lojasShopeeDoEscopo } from "@/lib/shopee/lojas";
import { escopoDoUsuario } from "@/lib/conta";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// GET = cron (todas as lojas). POST = usuário (só as lojas da conta).
async function rodar(lojas: { lojaId: string }[], dias: number) {
  const resultados = [];
  for (const l of lojas) {
    resultados.push(await sincronizarCarteiraLoja({ lojaId: l.lojaId, dias }));
  }
  const importadas = resultados.reduce((t, r) => t + r.importadas, 0);
  return NextResponse.json({ sucesso: true, importadas, lojas: resultados });
}

export async function GET(request: NextRequest) {
  // cron usa 14 dias (todas as lojas). Backfill manual: ?dias=45&loja=<id>
  // (uma loja por vez, senão o backfill de todas estoura o tempo da Vercel).
  const dias = Number(request.nextUrl.searchParams.get("dias")) || 14;
  const loja = request.nextUrl.searchParams.get("loja");
  let lojas = await listarLojasShopeeAtivas();
  if (loja) lojas = lojas.filter((l) => l.lojaId === loja);
  return rodar(lojas, dias);
}

export async function POST(request: NextRequest) {
  let dias = 30;
  try {
    const body = await request.json();
    if (body?.dias) dias = Number(body.dias);
  } catch {
    // padrão
  }
  const escopo = await escopoDoUsuario();
  const lojas = await lojasShopeeDoEscopo(escopo);
  return rodar(lojas, dias);
}
