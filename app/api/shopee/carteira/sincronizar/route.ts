import { NextRequest, NextResponse } from "next/server";
import { sincronizarCarteiraLoja } from "@/lib/shopee/carteira";
import { listarLojasShopeeAtivas, lojasShopeeDoEscopo } from "@/lib/shopee/lojas";
import { escopoDoUsuario } from "@/lib/conta";

export const dynamic = "force-dynamic";
export const maxDuration = 800;

// GET = cron (todas as lojas). POST = usuário (só as lojas da conta).
async function rodar(lojas: { lojaId: string }[], dias: number, pular = 0) {
  const resultados = [];
  for (const l of lojas) {
    resultados.push(await sincronizarCarteiraLoja({ lojaId: l.lojaId, dias, pular }));
  }
  const importadas = resultados.reduce((t, r) => t + r.importadas, 0);
  return NextResponse.json({ sucesso: true, importadas, lojas: resultados });
}

export async function GET(request: NextRequest) {
  // cron usa 14 dias (todas as lojas). Backfill manual em janelas:
  //   ?loja=<id>&dias=14&pular=0   (0-14 dias)
  //   ?loja=<id>&dias=14&pular=14  (14-28 dias) ...
  const dias = Number(request.nextUrl.searchParams.get("dias")) || 14;
  const pular = Number(request.nextUrl.searchParams.get("pular")) || 0;
  const loja = request.nextUrl.searchParams.get("loja");
  let lojas = await listarLojasShopeeAtivas();
  if (loja) lojas = lojas.filter((l) => l.lojaId === loja);
  return rodar(lojas, dias, pular);
}

export async function POST(request: NextRequest) {
  let dias = 30;
  let pular = 0;
  try {
    const body = await request.json();
    if (body?.dias) dias = Number(body.dias);
    if (body?.pular) pular = Number(body.pular);
  } catch {
    // padrão
  }
  const escopo = await escopoDoUsuario();
  const lojas = await lojasShopeeDoEscopo(escopo);
  return rodar(lojas, dias, pular);
}
