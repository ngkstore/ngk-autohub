import { NextRequest, NextResponse } from "next/server";
import { coletarAdsLoja } from "@/lib/shopee/adsColetor";
import { listarLojasShopeeAtivas } from "@/lib/shopee/lojas";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Coletor diário de Ads (Fase 1). GET = cron (todas as lojas Shopee ativas).
// ?dias=N controla o backfill (padrão 30). ?loja=<id> roda só uma loja.
export async function GET(request: NextRequest) {
  try {
    const dias = Math.min(90, Math.max(1, Number(request.nextUrl.searchParams.get("dias")) || 30));
    const loja = request.nextUrl.searchParams.get("loja");

    let lojas = await listarLojasShopeeAtivas();
    if (loja) lojas = lojas.filter((l) => l.lojaId === loja);

    const resultados = [];
    for (const l of lojas) {
      resultados.push(await coletarAdsLoja({ lojaId: l.lojaId, dias }));
    }
    return NextResponse.json({ sucesso: true, dias, resultados });
  } catch (error) {
    return NextResponse.json(
      { sucesso: false, erro: error instanceof Error ? error.message : "Erro ao coletar Ads." },
      { status: 500 }
    );
  }
}
