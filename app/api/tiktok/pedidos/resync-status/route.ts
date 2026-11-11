import { NextRequest, NextResponse } from "next/server";
import { autorizar } from "@/lib/autorizacao";
import { resyncStatusTikTok } from "@/lib/tiktok/resyncStatus";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Ressincroniza o status dos pedidos TikTok em aberto (os mais antigos primeiro).
//   GET /api/tiktok/pedidos/resync-status?limite=500&loja=<id>
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const lojaId = sp.get("loja") || undefined;
  const autz = await autorizar(request, lojaId ? [lojaId] : undefined);
  if (!autz.ok) return autz.resposta;
  const limite = Math.min(2000, Number(sp.get("limite")) || 500);
  const lojas = await resyncStatusTikTok({ lojaId, limite, orcamentoMs: 240_000 });
  const total = lojas.reduce((s, l) => ({ lidos: s.lidos + l.lidos, mudaram: s.mudaram + l.mudaram }), { lidos: 0, mudaram: 0 });
  return NextResponse.json({ sucesso: true, ...total, lojas });
}
