import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { coletarAfiliados, type ResultadoColeta } from "@/lib/shopee/afiliadosColetor";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Cron diário do Gestor de Afiliados. Enquanto estamos validando, roda só nas
// lojas listadas em configuracoes.afiliados_coleta_lojas (ids separados por
// vírgula; vazio = todas as conectadas). ?loja=<id>&dias=N&max=N pra backfill.
export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const dias = Math.min(Number(sp.get("dias")) || 3, 90);
    const maxDias = Math.min(Number(sp.get("max")) || 10, 30);
    const soConteudos = sp.get("conteudos") !== "0";
    const soTaxas = sp.get("taxas") !== "0";

    let lojas: string[];
    if (sp.get("loja")) {
      lojas = [sp.get("loja")!];
    } else {
      const { data: cfg } = await supabase
        .from("configuracoes")
        .select("valor")
        .eq("chave", "afiliados_coleta_lojas")
        .maybeSingle();
      const lista = String(cfg?.valor || "").split(",").map((s) => s.trim()).filter(Boolean);
      if (lista.length > 0) {
        lojas = lista;
      } else {
        const { data } = await supabase.from("shopee_ams_tokens").select("loja_id").eq("status", "ativo");
        lojas = (data || []).map((t) => t.loja_id as string);
      }
    }

    const resultados: ResultadoColeta[] = [];
    for (const lojaId of lojas) {
      try {
        resultados.push(
          await coletarAfiliados(lojaId, { dias, maxDias, conteudos: soConteudos, taxas: soTaxas })
        );
      } catch (e) {
        resultados.push({
          lojaId, ultimoDia: "", diasColetados: [], produtos: 0, afiliados: 0, conteudos: 0, itensTaxa: 0,
          erro: e instanceof Error ? e.message : String(e),
        });
      }
    }
    return NextResponse.json({ sucesso: resultados.every((r) => !r.erro), lojas: resultados });
  } catch (error) {
    return NextResponse.json(
      { sucesso: false, erro: error instanceof Error ? error.message : "Erro na coleta de afiliados" },
      { status: 500 }
    );
  }
}
