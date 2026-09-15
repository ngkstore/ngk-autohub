import { supabase } from "@/lib/supabase";
import { editarCampanhaProduto, type AcaoEdicao } from "@/lib/shopee/adsEditar";

// Ajuste de orçamento/meta de UMA campanha com toda a contabilidade do sistema:
// auditoria (ads_ajustes), snapshot de hoje, relógio (ads_alteracoes), base do
// reforço automático e recomendação marcada como 'aplicada'. Usado pela rota
// assistida (/api/shopee/ads/ajustar) e pelo lote (/api/shopee/ads/aplicar-ideal).
export type ResultadoAjuste = { campo: "orcamento" | "meta_roas"; valor: number; sucesso: boolean; erro?: string };

export async function aplicarAjuste(args: {
  lojaId: string;
  campaignId: number;
  itemId?: number | null;
  orcamento?: number | null;
  metaRoas?: number | null;
  usuario: string;
  simular?: boolean;
}): Promise<{ resultados: ResultadoAjuste[]; nadaAAlterar: boolean }> {
  const { lojaId, campaignId, usuario } = args;
  const simular = args.simular === true;
  const orcamento = args.orcamento ?? null;
  const metaRoas = args.metaRoas ?? null;

  // Valores atuais (último snapshot da campanha).
  const { data: cfg } = await supabase
    .from("ads_campaign_config_daily")
    .select("orcamento, meta_roas, item_id, dia")
    .eq("loja_id", lojaId)
    .eq("campaign_id", campaignId)
    .order("dia", { ascending: false })
    .limit(1)
    .maybeSingle();

  const acoes: AcaoEdicao[] = [];
  if (orcamento !== null && Number(cfg?.orcamento) !== orcamento) acoes.push({ campo: "orcamento", valor: orcamento });
  if (metaRoas !== null && Number(cfg?.meta_roas) !== metaRoas) acoes.push({ campo: "meta_roas", valor: metaRoas });
  if (acoes.length === 0) return { resultados: [], nadaAAlterar: true };

  const resultados = await editarCampanhaProduto({ lojaId, campaignId, acoes, simular });
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const item = args.itemId ?? (cfg?.item_id != null ? Number(cfg.item_id) : null);

  for (const r of resultados) {
    const antigo = r.campo === "orcamento" ? cfg?.orcamento : cfg?.meta_roas;
    await supabase.from("ads_ajustes").insert({
      loja_id: lojaId,
      campaign_id: campaignId,
      item_id: item,
      campo: r.campo,
      valor_antigo: antigo ?? null,
      valor_novo: r.valor,
      reference_id: r.reference_id,
      simulado: r.simulado,
      sucesso: r.sucesso,
      resposta: r.resposta ?? r.body,
      usuario,
    });
    if (r.sucesso && !r.simulado) {
      // Snapshot de hoje passa a refletir o novo valor (a página mostra na hora).
      await supabase
        .from("ads_campaign_config_daily")
        .update(r.campo === "orcamento" ? { orcamento: r.valor } : { meta_roas: r.valor })
        .eq("loja_id", lojaId)
        .eq("campaign_id", campaignId)
        .eq("dia", hoje);
      // Relógio: registra a alteração hoje (inicia a janela de estabilização se for meta).
      await supabase.from("ads_alteracoes").upsert(
        {
          loja_id: lojaId,
          item_id: item,
          campaign_id: campaignId,
          data_deteccao: hoje,
          campo: r.campo,
          valor_antigo: antigo != null ? String(antigo) : null,
          valor_novo: String(r.valor),
        },
        { onConflict: "loja_id,campaign_id,data_deteccao,campo" }
      );
      // Reforço automático ativo hoje? O valor salvo vira a nova base.
      if (r.campo === "orcamento") {
        await supabase
          .from("ads_reforcos")
          .update({ orcamento_base: r.valor, orcamento_atual: r.valor })
          .eq("loja_id", lojaId).eq("campaign_id", campaignId).eq("dia", hoje).is("revertido_em", null);
      }
    }
  }
  if (!simular && item != null && resultados.some((r) => r.sucesso)) {
    await supabase.from("ads_recomendacoes").update({ status: "aplicada" }).eq("loja_id", lojaId).eq("item_id", item).eq("dia", hoje);
  }
  return { resultados: resultados.map((r) => ({ campo: r.campo, valor: r.valor, sucesso: r.sucesso, erro: r.erro })), nadaAAlterar: false };
}
