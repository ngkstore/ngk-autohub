import { NextRequest, NextResponse } from "next/server";
import { autorizar } from "@/lib/autorizacao";
import { lojasTikTokAtivas } from "@/lib/tiktok/lojas";
import { rodarDiarioCreators } from "@/lib/creators/diario";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Creators — cron diário (SÓ LEITURA + cálculo): produtos parados, nota e sugestão de cada pedido de
// amostra aberto, alerta de "Aprovar" vencendo em menos de 12 h. GET ?loja=<id>
export async function GET(request: NextRequest) {
  const lojaId = request.nextUrl.searchParams.get("loja") || undefined;
  const autz = await autorizar(request, lojaId ? [lojaId] : undefined);
  if (!autz.ok) return autz.resposta;
  const lojas = (await lojasTikTokAtivas()).filter((l) => !lojaId || l.lojaId === lojaId);
  const saida = [];
  for (const loja of lojas) saida.push(await rodarDiarioCreators(loja).catch((e) => ({ loja_id: loja.lojaId, erro: e instanceof Error ? e.message : String(e) })));
  return NextResponse.json({ sucesso: true, lojas: saida });
}
