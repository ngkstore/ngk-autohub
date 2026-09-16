import { supabase } from "@/lib/supabase";
import { obterToken, chamar } from "@/lib/shopee/adsColetor";
import { enviarTelegram } from "@/lib/telegram";
import { nomeLojaPublico } from "@/lib/shopee/lojas";

// Saúde da conta (Account Health). Coleta diária por loja dos 5 endpoints só-leitura:
// get_shop_performance (métricas x meta), get_penalty_point_history, get_punishment_history,
// get_late_orders, get_listings_with_issues. Grava snapshot + tabelas de detalhe e manda
// alerta no Telegram (1x por chave/dia) quando algo está fora da meta ou apareceu novo.

type R = Record<string, unknown>;
const n = (v: unknown) => (v == null || v === "" ? null : Number(v));
const ts = (v: unknown) => (v == null || Number(v) === 0 ? null : new Date(Number(v) * 1000).toISOString());
const hojeBRT = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const RATING: Record<number, string> = { 1: "Ruim", 2: "Precisa melhorar", 3: "Bom", 4: "Excelente" };
export const TIPO_METRICA: Record<number, string> = { 1: "Envio", 2: "Anúncios", 3: "Atendimento" };
export const METRICA_PT: Record<number, string> = {
  [-1]: "Chats não respondidos", 1: "Taxa de atraso no envio", 3: "Taxa de não cumprimento", 4: "Tempo de preparo",
  11: "Taxa de resposta no chat", 12: "% de anúncios em pré-venda", 15: "Dias de violação de pré-venda",
  21: "Tempo de resposta", 22: "Avaliação da loja", 23: "Nº de chats não respondidos", 25: "Taxa de entrega rápida",
  27: "Falha de coleta no prazo", 28: "Valor de violação de coleta", 29: "Tempo médio de resposta",
  42: "Taxa de cancelamento", 43: "Taxa de devolução/reembolso", 52: "Violações graves de anúncio",
  53: "Outras violações de anúncio", 54: "Anúncios proibidos", 55: "Falsificação / propriedade intelectual",
  56: "Anúncios spam", 85: "Taxa de atraso (NDD)", 88: "Não cumprimento (NDD)", 91: "Cancelamento (NDD)",
  92: "Devolução (NDD)", 95: "Satisfação do cliente", 96: "% anúncios SDD", 97: "% anúncios NDD",
  2001: "Entrega rápida - SLS", 2002: "Entrega rápida - FBS", 2003: "Entrega rápida - 3PF",
  2011: "Produtos de baixa qualidade", 2030: "% anúncios HD", 2031: "% HD com frete grátis",
  2032: "Envio aos sábados", 2033: "Tempo de preparo (PS)", 2036: "OTDR logística", 2037: "OTDR DD",
};
export const MOTIVO_ANUNCIO: Record<number, string> = {
  1: "Proibido", 2: "Falsificado", 3: "Spam", 4: "Imagem inadequada", 5: "Informação insuficiente",
  6: "Melhoria do anúncio (Mall)", 7: "Melhoria do anúncio", 8: "Produto PQR",
};
const VIOLACAO_BASE: Record<number, string> = {
  5: "Alta taxa de atraso no envio", 6: "Alta taxa de não cumprimento", 7: "Muitos pedidos não cumpridos",
  8: "Muitos pedidos enviados com atraso", 9: "Anúncios proibidos", 10: "Falsificação / propriedade intelectual",
  11: "Spam", 12: "Cópia de imagens", 13: "Reupload de anúncio removido", 14: "Falsificado comprado do Mall",
  15: "Falsificação detectada pela Shopee", 16: "Alta % de pré-venda", 17: "Tentativas de fraude",
  18: "Fraude com cupons", 19: "Endereço de devolução falso", 20: "Fraude/abuso de envio",
  21: "Muitos chats não respondidos", 22: "Respostas rudes no chat", 23: "Pediu ao comprador para cancelar",
  24: "Resposta rude a avaliação", 25: "Violação da política de devolução", 101: "Motivo de nível",
  3026: "Uso indevido da marca Shopee", 3028: "Nome de loja irregular", 3030: "Transação fora da Shopee",
  3032: "Pacote vazio/incompleto", 3034: "Violação grave no Feed", 3036: "Violação grave na LIVE",
  3048: "Spam no chat", 3052: "Vazamento de privacidade em resposta", 3054: "Order brushing",
  3056: "Imagem imprópria", 3058: "Categoria incorreta", 3060: "Não cumprimento extremo",
  3062: "Fatura de afiliados (AMS) em atraso", 3068: "Não cumprimento (NDD)", 3070: "Atraso no envio (NDD)",
  3072: "Violação de coleta (OPFR)", 3074: "Transação fora da Shopee via chat", 3145: "Devolução (canal não integrado)",
  4130: "Produto de baixa qualidade",
};
export function violacaoPt(t: number | null | undefined): string {
  if (t == null) return "—";
  if (VIOLACAO_BASE[t]) return VIOLACAO_BASE[t];
  if (t >= 3090 && t <= 3093) return "Anúncios proibidos";
  if (t >= 3094 && t <= 3097) return "Anúncios falsificados";
  if (t >= 3098 && t <= 3101) return "Anúncios spam";
  return `Violação ${t}`;
}
export const PUNICAO_PT: Record<number, string> = {
  103: "Anúncios ocultos na navegação por categoria", 104: "Anúncios ocultos na busca", 105: "Bloqueio de criação de anúncios",
  106: "Bloqueio de edição de anúncios", 107: "Bloqueio de campanhas de marketing", 108: "Sem subsídio de frete",
  109: "Conta suspensa", 600: "Anúncios ocultos na busca", 601: "Loja fora das recomendações",
  602: "Anúncios ocultos na categoria", 1109: "Limite de anúncios reduzido", 1110: "Limite de anúncios reduzido",
  1111: "Limite de anúncios reduzido", 1112: "Limite de anúncios reduzido", 2008: "Limite de pedidos",
};

// Meta: "<" / "<=" = no máximo; ">" / ">=" = no mínimo.
export function foraDaMeta(atual: number | null, alvo: number | null, comp: string | null): boolean | null {
  if (atual == null || alvo == null || !comp) return null;
  switch (comp) {
    case "<": return !(atual < alvo);
    case "<=": return !(atual <= alvo);
    case ">": return !(atual > alvo);
    case ">=": return !(atual >= alvo);
    case "=": return atual !== alvo;
    default: return null;
  }
}
export function fmtValor(v: number | null, unidade: number | null): string {
  if (v == null) return "—";
  const s = Number.isInteger(v) ? String(v) : v.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  switch (unidade) {
    case 2: return `${s}%`;
    case 3: return `${s} s`;
    case 4: return `${s} dia(s)`;
    case 5: return `${s} h`;
    default: return s;
  }
}
export function fmtMeta(alvo: number | null, comp: string | null, unidade: number | null): string {
  if (alvo == null) return "—";
  const v = fmtValor(alvo, unidade);
  if (comp === "<" || comp === "<=") return `até ${v}`;
  if (comp === ">" || comp === ">=") return `mín. ${v}`;
  return v;
}

export type ResultadoSaude = {
  lojaId: string; rating?: number | null; metricas?: number; fora?: number; penalidades?: number;
  punicoesAtivas?: number; atrasados?: number; anunciosProblema?: number; alertas?: number; erro?: string; cru?: R;
};

export async function coletarSaudeLoja(lojaId: string, opts: { cru?: boolean } = {}): Promise<ResultadoSaude> {
  const tok = await obterToken(lojaId);
  if (!tok) return { lojaId, erro: "loja sem token ativo" };
  const dia = hojeBRT();

  const perf = await chamar("/api/v2/account_health/get_shop_performance", tok);
  if (perf.error) return { lojaId, erro: `${perf.error}: ${perf.message || ""}`, cru: opts.cru ? perf : undefined };
  const resp = (perf.response || {}) as R;
  const overall = (resp.overall_performance || {}) as R;
  const lista = Array.isArray(resp.metric_list) ? (resp.metric_list as R[]) : [];

  await pausa(300);
  const pen = await chamar("/api/v2/account_health/get_penalty_point_history", tok, "&page_no=1&page_size=100");
  await pausa(300);
  const punAtivas = await chamar("/api/v2/account_health/get_punishment_history", tok, "&punishment_status=1&page_no=1&page_size=100");
  await pausa(300);
  const punEnc = await chamar("/api/v2/account_health/get_punishment_history", tok, "&punishment_status=2&page_no=1&page_size=50");
  await pausa(300);
  const late = await chamar("/api/v2/account_health/get_late_orders", tok, "&page_no=1&page_size=100");
  await pausa(300);
  const issues = await chamar("/api/v2/account_health/get_listings_with_issues", tok, "&page_no=1&page_size=100");

  // ---- métricas
  const metricas = lista.map((m) => {
    const alvo = (m.target || {}) as R;
    const atual = n(m.current_period), alvoV = n(alvo.value), comp = alvo.comparator ? String(alvo.comparator) : null;
    return {
      loja_id: lojaId, dia, metric_id: Number(m.metric_id), metric_type: n(m.metric_type), parent_metric_id: n(m.parent_metric_id),
      nome: m.metric_name ? String(m.metric_name) : null, atual, anterior: n(m.last_period), unidade: n(m.unit),
      alvo: alvoV, comparador: comp, isencao_ate: m.exemption_end_date ? String(m.exemption_end_date) : null,
      fora_da_meta: foraDaMeta(atual, alvoV, comp),
    };
  });
  if (metricas.length) await supabase.from("saude_metricas").upsert(metricas, { onConflict: "loja_id,dia,metric_id" });
  const fora = metricas.filter((m) => m.fora_da_meta === true);

  // ---- penalidades (pontos): detecta as novas antes do upsert
  const penLista = Array.isArray((pen.response as R)?.penalty_point_list) ? ((pen.response as R).penalty_point_list as R[]) : [];
  const penRows = penLista.map((p) => ({
    loja_id: lojaId, reference_id: Number(p.reference_id || 0), issue_time: ts(p.issue_time) || new Date(0).toISOString(),
    violation_type: Number(p.violation_type || 0), pontos_original: n(p.original_point_num), pontos_atual: n(p.latest_point_num),
  }));
  type ChavePen = { reference_id: unknown; issue_time: unknown; violation_type: unknown };
  const chavePen = (x: ChavePen) => `${x.reference_id}|${new Date(String(x.issue_time)).getTime()}|${x.violation_type}`;
  const { data: penExist } = await supabase.from("saude_penalidades").select("reference_id, issue_time, violation_type").eq("loja_id", lojaId);
  const jaVistas = new Set(((penExist as ChavePen[]) || []).map(chavePen));
  const penNovas = penRows.filter((p) => !jaVistas.has(chavePen(p)));
  if (penRows.length) await supabase.from("saude_penalidades").upsert(penRows, { onConflict: "loja_id,reference_id,issue_time,violation_type" });
  const corte90 = Date.now() - 90 * 864e5;
  const pontos90 = penRows.filter((p) => new Date(p.issue_time).getTime() >= corte90).reduce((s, p) => s + (p.pontos_atual || 0), 0);

  // ---- punições
  const listaPun = (r: R, status: number): (R & { _status: number })[] =>
    (Array.isArray((r.response as R)?.punishment_list) ? ((r.response as R).punishment_list as R[]) : []).map((p) => ({ ...p, _status: status }));
  const punRows = [...listaPun(punAtivas, 1), ...listaPun(punEnc, 2)].map((p) => ({
    loja_id: lojaId, reference_id: Number(p.reference_id || 0), punishment_type: Number(p.punishment_type || 0),
    start_time: ts(p.start_time) || ts(p.issue_time) || new Date(0).toISOString(), issue_time: ts(p.issue_time), end_time: ts(p.end_time),
    reason: n(p.reason), listing_limit: Array.isArray(p.listing_limit) ? (p.listing_limit as number[]) : null,
    order_limit: p.order_limit != null ? String(p.order_limit) : null, status: Number(p._status),
  }));
  if (punRows.length) await supabase.from("saude_punicoes").upsert(punRows, { onConflict: "loja_id,reference_id,punishment_type,start_time" });
  const ativas = punRows.filter((p) => p.status === 1);

  // ---- pedidos atrasados / anúncios com problema (substitui o dia)
  const lateLista = Array.isArray((late.response as R)?.late_order_list) ? ((late.response as R).late_order_list as R[]) : [];
  const lateTotal = n((late.response as R)?.total_count) ?? lateLista.length;
  await supabase.from("saude_pedidos_atrasados").delete().eq("loja_id", lojaId).eq("dia", dia);
  if (lateLista.length) await supabase.from("saude_pedidos_atrasados").insert(lateLista.map((o) => ({
    loja_id: lojaId, dia, order_sn: String(o.order_sn), shipping_deadline: ts(o.shipping_deadline), late_by_days: n(o.late_by_days),
  })));
  const issLista = Array.isArray((issues.response as R)?.listing_list) ? ((issues.response as R).listing_list as R[]) : [];
  const issTotal = n((issues.response as R)?.total_count) ?? issLista.length;
  await supabase.from("saude_anuncios_problema").delete().eq("loja_id", lojaId).eq("dia", dia);
  if (issLista.length) await supabase.from("saude_anuncios_problema").upsert(issLista.map((i) => ({
    loja_id: lojaId, dia, item_id: Number(i.item_id), reason: n(i.reason),
  })), { onConflict: "loja_id,dia,item_id" });

  // ---- rating anterior (pra alertar queda)
  const { data: ant } = await supabase.from("saude_conta_snapshot").select("rating").eq("loja_id", lojaId).lt("dia", dia).order("dia", { ascending: false }).limit(1).maybeSingle();
  const rating = n(overall.rating);
  const listingFailed = Array.isArray(overall.listing_failed) ? (overall.listing_failed as number[]).reduce((s, x) => s + Number(x || 0), 0) : n(overall.listing_failed);

  await supabase.from("saude_conta_snapshot").upsert({
    loja_id: lojaId, dia, rating, falhas_envio: n(overall.fulfillment_failed), falhas_anuncio: listingFailed,
    falhas_atendimento: n(overall.custom_service_failed), metricas_fora: fora.length, pedidos_atrasados: lateTotal,
    anuncios_problema: issTotal, pontos_penalidade: pontos90, punicoes_ativas: ativas.length,
    bruto: { overall_performance: overall, penalidades: pen.response ?? pen, punicoes_ativas: punAtivas.response ?? punAtivas },
    coletado_em: new Date().toISOString(),
  }, { onConflict: "loja_id,dia" });

  // ---- alertas (Telegram), 1x por chave/dia
  const alertas: { chave: string; dia: string; texto: string }[] = [];
  const SEMPRE = "1970-01-01"; // chave única "pra sempre" (penalidade/punição nova)
  for (const m of fora) {
    alertas.push({ chave: `metrica:${m.metric_id}`, dia, texto: `⚠️ ${METRICA_PT[m.metric_id] || m.nome}: ${fmtValor(m.atual, m.unidade)} (meta ${fmtMeta(m.alvo, m.comparador, m.unidade)})` });
  }
  for (const p of penNovas) {
    if (new Date(p.issue_time).getTime() < Date.now() - 30 * 864e5) continue; // histórico antigo na 1ª carga não alarma
    alertas.push({ chave: `penalidade:${p.reference_id}:${p.issue_time}`, dia: SEMPRE, texto: `🚫 ${p.pontos_atual ?? p.pontos_original ?? "?"} ponto(s) de penalidade: ${violacaoPt(p.violation_type)} (${new Date(p.issue_time).toLocaleDateString("pt-BR")})` });
  }
  for (const p of ativas) {
    alertas.push({ chave: `punicao:${p.punishment_type}:${p.start_time}`, dia: SEMPRE, texto: `⛔ Punição em vigor: ${PUNICAO_PT[p.punishment_type] || `tipo ${p.punishment_type}`}${p.end_time ? ` até ${new Date(p.end_time).toLocaleDateString("pt-BR")}` : ""}${p.order_limit ? ` (limite de pedidos ${p.order_limit}%)` : ""}` });
  }
  if ((lateTotal || 0) > 0) alertas.push({ chave: "atrasados", dia, texto: `🕒 ${lateTotal} pedido(s) com envio atrasado` });
  if ((issTotal || 0) > 0) alertas.push({ chave: "anuncios_problema", dia, texto: `📝 ${issTotal} anúncio(s) com problema apontado pela Shopee` });
  if (rating != null && ant?.rating != null && rating < Number(ant.rating)) {
    alertas.push({ chave: "rating", dia, texto: `📉 Nota geral caiu: ${RATING[Number(ant.rating)] || ant.rating} → ${RATING[rating] || rating}` });
  }

  let enviados = 0;
  if (alertas.length) {
    const { data: jaEnv } = await supabase.from("saude_alertas").select("chave, dia").eq("loja_id", lojaId).in("chave", alertas.map((a) => a.chave));
    const setEnv = new Set(((jaEnv as { chave: string; dia: string }[]) || []).map((a) => `${a.chave}|${a.dia}`));
    const novos = alertas.filter((a) => !setEnv.has(`${a.chave}|${a.dia}`));
    if (novos.length) {
      const nome = await nomeLojaPublico(lojaId);
      const cab = `🩺 Saúde da conta — ${nome}\nNota geral: ${rating != null ? RATING[rating] || rating : "—"} · ${fora.length} métrica(s) fora da meta`;
      const ok = await enviarTelegram(`${cab}\n\n${novos.map((a) => `• ${a.texto}`).join("\n")}\n\n🔗 https://ngk-autohub.vercel.app/saude?loja=${lojaId}`);
      if (ok) {
        await supabase.from("saude_alertas").upsert(novos.map((a) => ({ loja_id: lojaId, chave: a.chave, dia: a.dia, texto: a.texto })), { onConflict: "loja_id,chave,dia" });
        enviados = novos.length;
      }
    }
  }

  return {
    lojaId, rating, metricas: metricas.length, fora: fora.length, penalidades: penRows.length, punicoesAtivas: ativas.length,
    atrasados: lateTotal ?? 0, anunciosProblema: issTotal ?? 0, alertas: enviados,
    cru: opts.cru ? { get_shop_performance: perf, get_penalty_point_history: pen, get_punishment_history_ativas: punAtivas, get_late_orders: late, get_listings_with_issues: issues } : undefined,
  };
}
