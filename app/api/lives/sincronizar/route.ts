import { NextRequest, NextResponse } from "next/server";
import { autorizar } from "@/lib/autorizacao";
import { supabase } from "@/lib/supabase";
import { lojasTikTokAtivas } from "@/lib/tiktok/lojas";
import { coletarLivesTikTok, coletarProdutosCanalTikTok, coletarVideosTikTok } from "@/lib/tiktok/lives";
import { coletarPedidosAfiliadosTikTok } from "@/lib/tiktok/afiliados";
import { coletarConversoesAms } from "@/lib/shopee/amsConversao";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// E1/E2/E3 — cron diário de madrugada (dia anterior) e disparo manual depois da live:
//   GET /api/lives/sincronizar?dias=7&loja=<id>&canal=tiktok|shopee
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const lojaId = sp.get("loja") || undefined;
  const autz = await autorizar(request, lojaId ? [lojaId] : undefined);
  if (!autz.ok) return autz.resposta;
  const dias = Math.min(90, Number(sp.get("dias")) || 7);
  const canal = sp.get("canal");
  const saida: Record<string, unknown>[] = [];

  if (!canal || canal === "tiktok") {
    const lojas = (await lojasTikTokAtivas()).filter((l) => !lojaId || l.lojaId === lojaId);
    for (const l of lojas) {
      const [lives, videos, produtos, afiliados] = [await coletarLivesTikTok(l, dias), await coletarVideosTikTok(l, dias), await coletarProdutosCanalTikTok(l, dias), await coletarPedidosAfiliadosTikTok(l, Math.floor(Date.now() / 1000) - dias * 86400)];
      saida.push({ canal: "tiktok", loja_id: l.lojaId, lives, videos, produtos, afiliados });
    }
  }
  if (!canal || canal === "shopee") {
    let q = supabase.from("shopee_ams_tokens").select("loja_id");
    if (lojaId) q = q.eq("loja_id", lojaId);
    const { data } = await q;
    for (const t of data || []) {
      const r = await coletarConversoesAms(String(t.loja_id), dias);
      saida.push({ canal: "shopee", loja_id: t.loja_id, conversoes: r });
    }
  }
  return NextResponse.json({ sucesso: true, dias, lojas: saida });
}
