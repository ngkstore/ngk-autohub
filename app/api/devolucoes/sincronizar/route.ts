import { NextRequest, NextResponse } from "next/server";
import { autorizar } from "@/lib/autorizacao";
import { sincronizarDevolucoes } from "@/lib/devolucoes/sincronizar";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// B2 — coleta de devoluções (Shopee returns + TikTok returns/cancellations).
//   GET /api/devolucoes/sincronizar                 (cron a cada 15 min: incremental por marca d'água)
//   GET ?canal=shopee|tiktok&loja=<id>&dias=90      (carga inicial / reprocessar um período)
// Cron (Bearer CRON_SECRET) ou usuário com acesso à loja pedida (lote: só admin).
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const lojaId = sp.get("loja") || undefined;
  const autz = await autorizar(request, lojaId ? [lojaId] : undefined);
  if (!autz.ok) return autz.resposta;
  const canal = sp.get("canal") === "shopee" || sp.get("canal") === "tiktok" ? (sp.get("canal") as "shopee" | "tiktok") : undefined;
  const dias = Number(sp.get("dias")) || undefined;

  const resultados = await sincronizarDevolucoes({ canal, lojaId, dias, orcamentoMs: 250_000 });
  const total = resultados.reduce((s, r) => ({ vistos: s.vistos + r.vistos, gravados: s.gravados + r.gravados, erros: s.erros + r.erros }), { vistos: 0, gravados: 0, erros: 0 });
  return NextResponse.json({ sucesso: true, ...total, lojas: resultados });
}
