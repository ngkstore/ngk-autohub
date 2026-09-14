import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { escopoDoUsuario, podeVerLoja } from "@/lib/conta";
import { editarCampanhaProduto, type AcaoEdicao } from "@/lib/shopee/adsEditar";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Ajuste ASSISTIDO de orçamento diário / meta ROAS de uma campanha (Fase 4).
// - Só usuário logado E dono da loja (podeVerLoja) — não é rota de cron.
// - A confirmação manual é feita na tela (AjusteAds); aqui cada chamada = 1 item.
// - Grava auditoria em ads_ajustes, reflete no snapshot de hoje, registra a
//   alteração em ads_alteracoes (inicia a janela de estabilização) e marca a
//   recomendação do dia como 'aplicada'. ?simular via body {simular:true} só monta.
const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
};

export async function POST(request: NextRequest) {
  try {
    const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const lojaId = String(b.lojaId || "");
    const campaignId = Number(b.campaignId);
    const itemId = b.itemId != null && b.itemId !== "" ? Number(b.itemId) : null;
    const simular = b.simular === true;
    const orcamento = num(b.orcamento);
    const metaRoas = num(b.metaRoas);

    if (!lojaId || !Number.isFinite(campaignId)) {
      return NextResponse.json({ sucesso: false, erro: "lojaId e campaignId são obrigatórios." }, { status: 400 });
    }
    if (orcamento !== null && (Number.isNaN(orcamento) || orcamento < 0)) {
      return NextResponse.json({ sucesso: false, erro: "Orçamento inválido." }, { status: 400 });
    }
    if (metaRoas !== null && (Number.isNaN(metaRoas) || metaRoas <= 0)) {
      return NextResponse.json({ sucesso: false, erro: "Meta ROAS inválida (tem que ser > 0)." }, { status: 400 });
    }

    const escopo = await escopoDoUsuario();
    if (!podeVerLoja(escopo, lojaId)) {
      return NextResponse.json({ sucesso: false, erro: "Loja fora da sua conta." }, { status: 403 });
    }

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
    if (acoes.length === 0) {
      return NextResponse.json({ sucesso: false, erro: "Nada a alterar (valores iguais aos atuais)." }, { status: 400 });
    }

    const resultados = await editarCampanhaProduto({ lojaId, campaignId, acoes, simular });
    const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
    const item = itemId ?? (cfg?.item_id != null ? Number(cfg.item_id) : null);

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
        usuario: escopo.email,
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
        // Reforço automático ativo hoje? O valor salvo manualmente vira a nova base
        // (a reversão da meia-noite volta pra ele, não pro valor de antes do reforço).
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

    return NextResponse.json({
      sucesso: resultados.every((r) => r.sucesso),
      simular,
      resultados: resultados.map((r) => ({ campo: r.campo, valor: r.valor, sucesso: r.sucesso, erro: r.erro })),
    });
  } catch (error) {
    return NextResponse.json(
      { sucesso: false, erro: error instanceof Error ? error.message : "Erro ao ajustar campanha." },
      { status: 500 }
    );
  }
}
