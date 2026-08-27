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

function primeiroDia(ano: number, mes: number) {
  return `${ano}-${String(mes).padStart(2, "0")}-01`;
}
function ultimoDia(ano: number, mes: number) {
  const d = new Date(Date.UTC(ano, mes, 0)).getUTCDate(); // dia 0 do mês seguinte
  return `${ano}-${String(mes).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const loja = sp.get("loja");
  const de = sp.get("de") || "2026-01";
  const ate = sp.get("ate") || de; // se não passar 'ate', faz só o mês 'de'

  const [ay, am] = de.split("-").map(Number);
  const [by, bm] = ate.split("-").map(Number);
  if (!ay || !am || !by || !bm) {
    return NextResponse.json({ sucesso: false, erro: "de/ate devem ser YYYY-MM" }, { status: 400 });
  }

  // Lista de meses [de..ate].
  const meses: { ano: number; mes: number }[] = [];
  let y = ay, m = am;
  let guard = 0;
  while ((y < by || (y === by && m <= bm)) && guard++ < 36) {
    meses.push({ ano: y, mes: m });
    m++;
    if (m > 12) { m = 1; y++; }
  }

  let lojas = await listarLojasShopeeAtivas();
  if (loja) lojas = lojas.filter((l) => l.lojaId === loja);

  const resultados: Record<string, unknown>[] = [];
  for (const l of lojas) {
    for (const { ano, mes } of meses) {
      const r = await sincronizarAdsLoja({
        lojaId: l.lojaId,
        ini: primeiroDia(ano, mes),
        fim: ultimoDia(ano, mes),
      });
      resultados.push({ loja: l.lojaId, mes: `${ano}-${String(mes).padStart(2, "0")}`, ...r });
    }
  }
  const importados = resultados.reduce((t, r) => t + (Number(r.importados) || 0), 0);
  return NextResponse.json({ sucesso: true, importados, meses: meses.length, lojas: lojas.length, resultados });
}
