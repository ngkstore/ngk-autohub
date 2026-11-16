import { NextRequest, NextResponse } from "next/server";
import { autorizar } from "@/lib/autorizacao";
import { supabase } from "@/lib/supabase";
import { lojasTikTokAtivas } from "@/lib/tiktok/lojas";
import { coletarAmostrasTikTok, coletarEnviosAmostras, coletarPerfisCriadores } from "@/lib/tiktok/creators";
import { coletarPedidosAfiliadosTikTok } from "@/lib/tiktok/afiliados";
import { avaliarEAlertar } from "@/lib/creators/diario";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Creators — cron a cada 30 min (SÓ LEITURA): pedidos de amostra (todas as páginas), perfil dos criadores
// novos ou com mais de 1 dia, pedidos de afiliado (30 d na primeira carga, depois incremental) e envios
// das amostras aprovadas. Fila/backoff próprio para o 36009002 (lib/tiktok/creators.ts).
//   GET ?loja=<id>&so=amostras|perfis|pedidos|envios
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const lojaId = sp.get("loja") || undefined;
  const autz = await autorizar(request, lojaId ? [lojaId] : undefined);
  if (!autz.ok) return autz.resposta;
  const so = sp.get("so");
  const roda = (e: string) => !so || so === e;
  const inicio = Date.now();
  const restante = () => Math.max(10_000, 240_000 - (Date.now() - inicio));
  const lojas = (await lojasTikTokAtivas()).filter((l) => !lojaId || l.lojaId === lojaId);
  const saida: Record<string, unknown>[] = [];
  for (const loja of lojas) {
    const r: Record<string, unknown> = { loja_id: loja.lojaId };
    if (roda("amostras")) r.amostras = await coletarAmostrasTikTok(loja, { orcamentoMs: Math.min(120_000, restante()) });
    if (roda("pedidos")) {
      // incremental: desde o último pedido coletado (com folga de 1 dia); primeira carga: 30 dias
      const { data: ult } = await supabase.from("tiktok_afiliado_pedidos").select("criado_em").eq("loja_id", loja.lojaId).order("criado_em", { ascending: false }).limit(1).maybeSingle();
      const desde = ult?.criado_em ? Math.floor(new Date(ult.criado_em).getTime() / 1000) - 86400 : Math.floor(Date.now() / 1000) - 30 * 86400;
      r.pedidos = await coletarPedidosAfiliadosTikTok(loja, desde);
    }
    if (roda("perfis")) r.perfis = await coletarPerfisCriadores(loja, { max: 40, orcamentoMs: Math.min(90_000, restante()) });
    if (roda("envios")) r.envios = await coletarEnviosAmostras(loja, { max: 40, orcamentoMs: Math.min(60_000, restante()) });
    // R-002: os pedidos vencem em horas — nota, sugestão e alerta a cada rodada (não só no diário)
    if (roda("avaliar")) r.avaliacao = await avaliarEAlertar(loja).catch((e) => ({ erro: e instanceof Error ? e.message : String(e) }));
    saida.push(r);
  }
  return NextResponse.json({ sucesso: true, lojas: saida, segundos: Math.round((Date.now() - inicio) / 1000) });
}
