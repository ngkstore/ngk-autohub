import { NextRequest, NextResponse } from "next/server";
import { sincronizarAdsLoja, buscarAdsBruto } from "@/lib/shopee/ads";
import { listarLojasShopeeAtivas, lojasShopeeDoEscopo } from "@/lib/shopee/lojas";
import { escopoDoUsuario } from "@/lib/conta";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function rodar(lojas: { lojaId: string }[], dias: number) {
  const resultados = [];
  for (const l of lojas) {
    resultados.push(await sincronizarAdsLoja({ lojaId: l.lojaId, dias }));
  }
  const importados = resultados.reduce((t, r) => t + r.importados, 0);
  return NextResponse.json({ sucesso: true, importados, lojas: resultados });
}

// GET = cron (todas as lojas). ?debug=1&loja=<id> mostra a resposta crua (sonda).
export async function GET(request: NextRequest) {
  const dias = Number(request.nextUrl.searchParams.get("dias")) || 29;
  const loja = request.nextUrl.searchParams.get("loja");

  if (request.nextUrl.searchParams.get("debug") === "1") {
    const ini = request.nextUrl.searchParams.get("ini");
    const fim = request.nextUrl.searchParams.get("fim");
    const bruto = await buscarAdsBruto(loja || "", dias, ini && fim ? { ini, fim } : undefined);
    return NextResponse.json({ debug: true, loja, ini, fim, ...bruto });
  }

  let lojas = await listarLojasShopeeAtivas();
  if (loja) lojas = lojas.filter((l) => l.lojaId === loja);
  return rodar(lojas, dias);
}

export async function POST(request: NextRequest) {
  let dias = 29;
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
