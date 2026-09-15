import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { aplicarAjuste } from "@/lib/shopee/adsAjuste";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// LOTE: leva o orçamento diário de todas as campanhas ativas de uma loja ao orçamento
// IDEAL calculado pelo motor (recomendação de hoje). Rota de cron (Bearer CRON_SECRET),
// disparada sob demanda. ?loja=<id> obrigatório · ?dry=1 só lista · ?min=10 piso em R$.
// Regras: pula ideal nulo (sem custo) ou 0 (abaixo do mínimo — a ação lá é pausar, e 0
// na Shopee significa SEM LIMITE), pula quem já está no ideal, arredonda pra inteiro.
type Row = Record<string, unknown>;
const n = (v: unknown) => Number(v || 0);

export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const lojaId = sp.get("loja") || "";
    const dry = sp.get("dry") === "1";
    const piso = Math.max(1, Number(sp.get("min")) || 10);
    const usuario = sp.get("usuario") || "lote aplicar-ideal";
    if (!lojaId) return NextResponse.json({ sucesso: false, erro: "?loja= é obrigatório" }, { status: 400 });

    const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
    const { data: recRaw } = await supabase
      .from("ads_recomendacoes")
      .select("item_id, campaign_id, produto, classificacao, orcamento_configurado, orcamento_ideal, censurado_teto, promo")
      .eq("loja_id", lojaId).eq("dia", hoje).order("gasto_7d", { ascending: false });
    const recs = (recRaw as Row[]) || [];
    const ids = recs.map((r) => String(r.item_id));
    const { data: prodRaw } = ids.length
      ? await supabase.from("produtos").select("item_id, nome").eq("loja_id", lojaId).in("item_id", ids)
      : { data: [] };
    const nomes: Record<string, string> = Object.fromEntries(((prodRaw as Row[]) || []).map((p) => [String(p.item_id), String(p.nome || "")]));

    const itens: Row[] = [];
    for (const r of recs) {
      const campaignId = n(r.campaign_id);
      const atual = r.orcamento_configurado != null ? n(r.orcamento_configurado) : null;
      const ideal = r.orcamento_ideal != null ? n(r.orcamento_ideal) : null;
      const base: Row = {
        item_id: r.item_id, campaign_id: campaignId, produto: (nomes[String(r.item_id)] || String(r.produto || "")).slice(0, 50),
        classificacao: r.classificacao, de: atual, ideal,
      };
      if (!campaignId) { itens.push({ ...base, acao: "pulado", motivo: "sem campanha" }); continue; }
      if (ideal == null) { itens.push({ ...base, acao: "pulado", motivo: "sem ideal (item sem custo cadastrado)" }); continue; }
      if (ideal <= 0) { itens.push({ ...base, acao: "pulado", motivo: "ideal 0 (abaixo do mínimo: a ação é pausar/revisar, não zerar o orçamento)" }); continue; }
      if (atual === 0) { itens.push({ ...base, acao: "pulado", motivo: "orçamento atual SEM LIMITE na Shopee; mexer nisso é decisão manual" }); continue; }
      const novo = Math.max(piso, Math.round(ideal));
      if (atual != null && Math.round(atual) === novo) { itens.push({ ...base, para: novo, acao: "igual", motivo: "já está no ideal" }); continue; }

      const { resultados, nadaAAlterar } = await aplicarAjuste({
        lojaId, campaignId, itemId: n(r.item_id), orcamento: novo, usuario, simular: dry,
      });
      const res = resultados[0];
      itens.push({ ...base, para: novo, acao: dry ? "simulado" : res?.sucesso ? "aplicado" : "falhou", motivo: nadaAAlterar ? "igual ao atual" : res?.erro });
      if (!dry) await new Promise((ok) => setTimeout(ok, 300)); // respeita o rate limit do Ads
    }

    const aplicados = itens.filter((i) => i.acao === "aplicado" || i.acao === "simulado");
    const resumo = {
      total: itens.length,
      alterados: aplicados.length,
      subiram: aplicados.filter((i) => n(i.para) > n(i.de)).length,
      desceram: aplicados.filter((i) => n(i.para) < n(i.de)).length,
      falharam: itens.filter((i) => i.acao === "falhou").length,
      pulados: itens.filter((i) => i.acao === "pulado").length,
      iguais: itens.filter((i) => i.acao === "igual").length,
      soma_de: aplicados.reduce((s, i) => s + n(i.de), 0),
      soma_para: aplicados.reduce((s, i) => s + n(i.para), 0),
    };
    return NextResponse.json({ sucesso: true, dry, loja: lojaId, resumo, itens });
  } catch (error) {
    return NextResponse.json({ sucesso: false, erro: error instanceof Error ? error.message : "Erro no lote." }, { status: 500 });
  }
}
