import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { reforcarLoja, reverterLoja } from "@/lib/shopee/adsReforco";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Reforço automático de orçamento (cron, Bearer CRON_SECRET).
//   GET /api/shopee/ads/reforco              → a cada 30 min: avalia e reforça (lojas com ads_reforco_auto)
//   GET /api/shopee/ads/reforco?reverter=1   → 00h05 BRT: volta tudo ao orçamento base
//   ?loja=<id> restringe a uma loja · ?dry=1 só simula (nenhuma escrita na Shopee nem no banco)
export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const reverter = sp.get("reverter") === "1";
    const dry = sp.get("dry") === "1";
    const lojaParam = sp.get("loja");

    let lojas: string[];
    if (lojaParam) lojas = [lojaParam];
    else {
      const { data } = await supabase.from("lojas").select("id").eq("marketplace", "shopee").eq("ads_reforco_auto", true);
      lojas = ((data as { id: string }[]) || []).map((l) => l.id);
    }

    const resultados = [];
    for (const id of lojas) {
      try {
        resultados.push(reverter ? await reverterLoja(id, dry) : await reforcarLoja(id, dry));
      } catch (e) {
        resultados.push({ loja: id, erro: e instanceof Error ? e.message : "erro" });
      }
    }
    return NextResponse.json({ sucesso: true, modo: reverter ? "reverter" : "reforcar", dry, resultados });
  } catch (error) {
    return NextResponse.json({ sucesso: false, erro: error instanceof Error ? error.message : "Erro no reforço." }, { status: 500 });
  }
}
