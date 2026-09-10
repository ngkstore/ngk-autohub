import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { enviarTelegram } from "@/lib/telegram";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Relatório semanal do controle de Ads GMV Max (spec §8), enviado por Telegram
// toda segunda (cron). Uma mensagem por loja que tem recomendações. ?dry=1 devolve
// os textos sem enviar; ?loja=<id> restringe. Mesma base da página /ads-controle.

type Rec = {
  item_id: number; gasto_7d: number; roas_real: number; roas_minimo: number | null;
  meta_roas: number | null; classificacao: string; acao: string; promo: boolean; alerta_roas: boolean;
};
const brl = (v: unknown) => (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const n = (v: unknown) => Number(v || 0);
const x1 = (v: unknown) => `${n(v).toFixed(1)}×`;
const ROTULO: Record<string, string> = {
  campeao: "campeões", abaixo_do_minimo: "abaixo do mínimo", meta_desalinhada: "meta desalinhada",
  aprendizado: "em aprendizado", sem_margem: "sem custo", saudavel: "saudáveis",
  problema_anuncio: "problema no anúncio", problema_pagina: "problema na página", meta_nao_entregue: "meta não entregue",
};
const PRIORIDADE = ["abaixo_do_minimo", "problema_anuncio", "problema_pagina", "meta_nao_entregue", "meta_desalinhada"];

async function montarTexto(lojaId: string, nomeLoja: string): Promise<string | null> {
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const [{ data: resumoRaw }, { data: recsRaw }, { data: fatRaw }] = await Promise.all([
    supabase.rpc("ads_resumo_controle", { p_loja_ids: [lojaId] }),
    supabase.from("ads_recomendacoes").select("*").eq("loja_id", lojaId).eq("dia", hoje).order("gasto_7d", { ascending: false }).limit(300),
    supabase.from("ads_fator_historico").select("*").eq("loja_id", lojaId).order("competencia", { ascending: false }).limit(1),
  ]);
  const r = (resumoRaw as Record<string, unknown>) || {};
  const recs = (recsRaw as Rec[]) || [];
  if (recs.length === 0) return null;

  const ids = [...new Set(recs.map((x) => String(x.item_id)))];
  const nomes: Record<string, string> = {};
  const { data: prods } = await supabase.from("produtos").select("item_id, nome").eq("loja_id", lojaId).in("item_id", ids);
  (prods as { item_id: string; nome: string }[] | null)?.forEach((p) => (nomes[p.item_id] = p.nome));
  const nome = (id: number) => (nomes[String(id)] || `item ${id}`).slice(0, 48);

  const sem = n(r.roas_semana), ant = n(r.roas_anterior);
  const seta = ant > 0 ? (sem >= ant ? "▲" : "▼") : "";
  const saldoDias = n(r.saldo_dias);
  const porClasse = (r.por_classificacao as { classificacao: string; qtd: number; gasto: number }[]) || [];

  const L: string[] = [];
  L.push(`🎯 Controle GMV Max — ${nomeLoja}`);
  L.push(`Semana: ROAS real ${x1(sem)} ${seta} (anterior ${x1(ant)} · média 4 sem ${x1(r.roas_media4s)})`);
  L.push(`Gasto ${brl(r.gasto_semana)} · em risco ${brl(r.gasto_risco)} · saldo ${brl(r.saldo)} (~${saldoDias} dia${saldoDias === 1 ? "" : "s"})`);
  L.push(`Situação: ` + porClasse.map((c) => `${c.qtd} ${ROTULO[c.classificacao] || c.classificacao}`).join(" · "));

  const alertas: string[] = [];
  if (saldoDias > 0 && saldoDias < 7) alertas.push(`saldo cobre só ~${saldoDias} dia(s) de gasto`);
  const despencando = recs.filter((x) => x.alerta_roas);
  if (despencando.length) alertas.push(`${despencando.length} item(ns) com ROAS < 0,7×mínimo há 3 dias`);
  const fat = ((fatRaw as Record<string, unknown>[]) || [])[0];
  if (fat && n(fat.divergencia_pct) > 10) alertas.push(`fator D+30 divergiu ${n(fat.divergencia_pct).toFixed(0)}% (estimado ${n(fat.fator_estimado).toFixed(3)} vs consolidado ${n(fat.fator_consolidado).toFixed(3)}) — recalibrar`);
  if (alertas.length) { L.push(""); L.push("🚨 Alertas:"); alertas.forEach((a) => L.push(`• ${a}`)); }

  const acoes = recs.filter((x) => PRIORIDADE.includes(x.classificacao)).slice(0, 6);
  if (acoes.length) {
    L.push(""); L.push("⚠️ Ações prioritárias (por gasto em risco):");
    acoes.forEach((x, i) => L.push(`${i + 1}. ${nome(x.item_id)} — ${brl(x.gasto_7d)} · ROAS ${x1(x.roas_real)} vs mín ${x.roas_minimo != null ? x1(x.roas_minimo) : "—"} → ${x.acao}${x.promo ? " (promo)" : ""}`));
  }
  const camp = recs.filter((x) => x.classificacao === "campeao").slice(0, 4);
  if (camp.length) {
    L.push(""); L.push("📈 Campeões pra escalar:");
    camp.forEach((x) => L.push(`• ${nome(x.item_id)} — ROAS ${x1(x.roas_real)} (mín ${x.roas_minimo != null ? x1(x.roas_minimo) : "—"}, meta ${x.meta_roas != null ? x1(x.meta_roas) : "—"})`));
  }
  const aprend = porClasse.find((c) => c.classificacao === "aprendizado");
  if (aprend) L.push(`\n⏳ ${aprend.qtd} item(ns) em aprendizado (aguardar 14 dias).`);
  const promos = recs.filter((x) => x.promo).length;
  if (promos) L.push(`🏷️ ${promos} item(ns) em promoção (regra de escalar suprimida).`);
  L.push(""); L.push("Detalhe completo: /ads-controle");
  return L.join("\n").slice(0, 4000);
}

export async function GET(request: NextRequest) {
  try {
    const dry = request.nextUrl.searchParams.get("dry") === "1";
    const lojaParam = request.nextUrl.searchParams.get("loja");
    let q = supabase.from("lojas").select("id, nome, nome_publico, apelido").eq("marketplace", "shopee").eq("status", "ativo");
    if (lojaParam) q = q.eq("id", lojaParam);
    const { data: lojas } = await q;
    const saida: { loja: string; enviado?: boolean; texto?: string; vazio?: boolean }[] = [];
    for (const l of (lojas as { id: string; nome: string; nome_publico: string | null; apelido: string | null }[]) || []) {
      const nomeLoja = l.nome_publico || l.apelido || l.nome;
      const texto = await montarTexto(l.id, nomeLoja);
      if (!texto) { saida.push({ loja: nomeLoja, vazio: true }); continue; }
      if (dry) { saida.push({ loja: nomeLoja, texto }); continue; }
      const ok = await enviarTelegram(texto);
      saida.push({ loja: nomeLoja, enviado: ok });
    }
    return NextResponse.json({ sucesso: true, dry, lojas: saida });
  } catch (error) {
    return NextResponse.json({ sucesso: false, erro: error instanceof Error ? error.message : "Erro no relatório." }, { status: 500 });
  }
}
