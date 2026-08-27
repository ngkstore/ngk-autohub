import { NextRequest, NextResponse } from "next/server";
import { sincronizarAdsLoja } from "@/lib/shopee/ads";
import { listarLojasShopeeAtivas } from "@/lib/shopee/lojas";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Backfill do Ads mês a mês (a API do Ads não aceita janela > 1 mês). Preenche
// ads_diario do histórico. Idempotente (upsert em loja_id,dia).
//   ?loja=<id>   -> só essa loja (padrão: todas as ativas)
//   ?de=YYYY-MM  -> mês inicial (padrão 2026-01)
//   ?ate=YYYY-MM -> mês final   (padrão: mês atual)
// Cada mês = 1 chamada na API, então é leve.

const dia = (t: number) => new Date(t).toISOString().slice(0, 10);

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const loja = sp.get("loja");
  const de = sp.get("de") || "2026-01"; // YYYY-MM inicial
  const ate = sp.get("ate") || de; // YYYY-MM final (inclusive)

  const [ay, am] = de.split("-").map(Number);
  const [by, bm] = ate.split("-").map(Number);
  if (!ay || !am || !by || !bm) {
    return NextResponse.json({ sucesso: false, erro: "de/ate devem ser YYYY-MM" }, { status: 400 });
  }

  // Janelas de 14 dias (a API do Ads recusa > ~1 mês; 14 é sempre seguro).
  // Do 1º dia do mês 'de' ao último dia do mês 'ate'.
  const inicio = Date.UTC(ay, am - 1, 1);
  const fimTotal = Date.UTC(by, bm, 0); // dia 0 do mês seguinte = último dia de 'ate'
  const PASSO = 14 * 864e5;
  const janelas: { ini: string; fim: string }[] = [];
  for (let t = inicio, guard = 0; t <= fimTotal && guard < 60; t += PASSO, guard++) {
    janelas.push({ ini: dia(t), fim: dia(Math.min(t + 13 * 864e5, fimTotal)) });
  }

  let lojas = await listarLojasShopeeAtivas();
  if (loja) lojas = lojas.filter((l) => l.lojaId === loja);

  const resultados: Record<string, unknown>[] = [];
  for (const l of lojas) {
    for (const j of janelas) {
      const r = await sincronizarAdsLoja({ lojaId: l.lojaId, ini: j.ini, fim: j.fim });
      resultados.push({ loja: l.lojaId, janela: `${j.ini}..${j.fim}`, ...r });
    }
  }
  const importados = resultados.reduce((t, r) => t + (Number(r.importados) || 0), 0);
  return NextResponse.json({ sucesso: true, importados, janelas: janelas.length, lojas: lojas.length, resultados });
}
