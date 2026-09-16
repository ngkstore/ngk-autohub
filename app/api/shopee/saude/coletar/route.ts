import { NextRequest, NextResponse } from "next/server";
import { coletarSaudeLoja } from "@/lib/shopee/saudeConta";
import { listarLojasShopeeAtivas } from "@/lib/shopee/lojas";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Coletor diário de Saúde da conta (Account Health). GET = cron (todas as lojas Shopee
// ativas). ?loja=<id> roda só uma loja; ?cru=1 devolve as respostas cruas da Shopee.
export async function GET(request: NextRequest) {
  try {
    const loja = request.nextUrl.searchParams.get("loja");
    const cru = request.nextUrl.searchParams.get("cru") === "1";
    let lojas = await listarLojasShopeeAtivas();
    if (loja) lojas = lojas.filter((l) => l.lojaId === loja);
    const resultados = [];
    for (const l of lojas) resultados.push(await coletarSaudeLoja(l.lojaId, { cru }));
    return NextResponse.json({ sucesso: true, resultados });
  } catch (error) {
    return NextResponse.json(
      { sucesso: false, erro: error instanceof Error ? error.message : "Erro ao coletar saúde da conta." },
      { status: 500 }
    );
  }
}
