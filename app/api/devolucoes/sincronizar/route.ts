import { NextRequest, NextResponse } from "next/server";
import { autorizar } from "@/lib/autorizacao";
import { sincronizarDevolucoes, reprocessarEtapasShopee } from "@/lib/devolucoes/sincronizar";
import { processarDevolucoes } from "@/lib/devolucoes/processar";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// B2 — coleta de devoluções (Shopee returns + TikTok returns/cancellations).
//   GET /api/devolucoes/sincronizar                 (cron a cada 15 min: incremental por marca d'água)
//   GET ?canal=shopee|tiktok&loja=<id>&dias=90&forcar=1  (carga inicial / reprocessar um período)
// Cron (Bearer CRON_SECRET) ou usuário com acesso à loja pedida (lote: só admin).
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const lojaId = sp.get("loja") || undefined;
  const autz = await autorizar(request, lojaId ? [lojaId] : undefined);
  if (!autz.ok) return autz.resposta;
  const canal = sp.get("canal") === "shopee" || sp.get("canal") === "tiktok" ? (sp.get("canal") as "shopee" | "tiktok") : undefined;
  const dias = Number(sp.get("dias")) || undefined;
  const forcar = sp.get("forcar") === "1"; // relê mesmo sem mudança (recarga de eventos/mídias)
  // ?reprocessar=1: só recalcula etapa/prazo dos casos abertos pelo bruto gravado (sem API)
  if (sp.get("reprocessar") === "1") return NextResponse.json({ sucesso: true, ...(await reprocessarEtapasShopee(lojaId)) });

  const inicio = Date.now();
  const resultados = await sincronizarDevolucoes({ canal, lojaId, dias, forcar, orcamentoMs: 200_000 });
  // B4: depois da coleta, o assistente/regras/alertas com o tempo que sobrou (mesmo cron).
  const semAssistente = sp.get("assistente") === "0";
  const assistente = semAssistente ? null : await processarDevolucoes({ lojaId, orcamentoMs: Math.max(20_000, 270_000 - (Date.now() - inicio)) });
  const total = resultados.reduce((s, r) => ({ vistos: s.vistos + r.vistos, gravados: s.gravados + r.gravados, erros: s.erros + r.erros }), { vistos: 0, gravados: 0, erros: 0 });
  return NextResponse.json({ sucesso: true, ...total, lojas: resultados, assistente });
}
