import { NextRequest, NextResponse } from "next/server";
import { autorizar } from "@/lib/autorizacao";
import { supabase } from "@/lib/supabase";
import { lojasTikTokAtivas } from "@/lib/tiktok/lojas";
import { coletarAtividadesTikTok, coletarPromocoesShopee } from "@/lib/campanhas/coleta";
import { calcularMargensCampanha } from "@/lib/campanhas/consultas";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// F2/F3 — cron diário: promoções próprias (Shopee + TikTok) e margem dos itens das campanhas
// em andamento ou futuras. GET ?loja=<id>&canal=shopee|tiktok&margem=0
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const lojaId = sp.get("loja") || undefined;
  const autz = await autorizar(request, lojaId ? [lojaId] : undefined);
  if (!autz.ok) return autz.resposta;
  const canal = sp.get("canal");
  const inicio = Date.now();
  const saida: Record<string, unknown>[] = [];
  if (!canal || canal === "shopee") {
    let q = supabase.from("marketplace_tokens").select("loja_id").eq("marketplace", "shopee").eq("status", "ativo");
    if (lojaId) q = q.eq("loja_id", lojaId);
    const { data } = await q;
    for (const t of data || []) if (t.loja_id) saida.push({ canal: "shopee", loja_id: t.loja_id, ...(await coletarPromocoesShopee(String(t.loja_id))) });
  }
  if (!canal || canal === "tiktok") {
    for (const l of (await lojasTikTokAtivas()).filter((l) => !lojaId || l.lojaId === lojaId)) saida.push({ canal: "tiktok", loja_id: l.lojaId, ...(await coletarAtividadesTikTok(l)) });
  }
  let margens = 0;
  if (sp.get("margem") !== "0") {
    const { data: camps } = await supabase.from("campanhas").select("id").or(`fim.gte.${new Date().toISOString()},fim.is.null`).limit(60);
    for (const c of camps || []) {
      if (Date.now() - inicio > 240_000) break;
      await calcularMargensCampanha(c.id);
      margens++;
    }
  }
  return NextResponse.json({ sucesso: true, lojas: saida, campanhas_com_margem: margens });
}
