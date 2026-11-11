import { supabase } from "@/lib/supabase";
import { pendenciasDevolucoes, urgencia, type Pendencia } from "@/lib/devolucoes/pendencias";

// Parte C — Painel do dia: junta tudo que tem prazo, do mais urgente ao menos.
// Cada pendência: { prazo, urgencia, canal, loja_id, titulo, detalhe, link, acao }.
export type { Pendencia };
export type Urgencia = Pendencia["urgencia"];

export type SaudeLoja = { loja_id: string; nome: string; canal: string; rating: string | null; metricas_fora: number; pedidos_atrasados: number; pontos: number; punicoes: number; dia: string | null; fora: { nome: string; atual: string | null; alvo: string | null }[] };
export type Conferencia = { nome: string; ok: boolean; texto: string };
export type Integracao = { nome: string; ok: boolean; texto: string };
export type Painel = {
  geradoEm: string;
  pendencias: Pendencia[];
  contagem: Record<Urgencia, number>;
  resolvidosHoje: number;
  resolvidosOntem: number;
  saude: SaudeLoja[];
  conferencias: Conferencia[];
  integracoes: Integracao[];
};

type J = Record<string, unknown>;
const unixIso = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? new Date(n * 1000).toISOString() : null;
};
const fmtHora = (iso: string | null) => (iso ? new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "");

async function nomesLojas(lojaIds: string[] | null): Promise<Map<string, { nome: string; canal: string }>> {
  let q = supabase.from("lojas").select("id, apelido, marketplace");
  if (lojaIds) q = q.in("id", lojaIds);
  const { data } = await q;
  return new Map((data || []).map((l) => [l.id, { nome: l.apelido, canal: l.marketplace === "tiktok_shop" ? "tiktok" : "shopee" }]));
}

// Pedidos a postar (Shopee ship_by_date; TikTok rts_sla_time / collection_due_time), agrupados por loja e prazo.
async function pendenciasPostagem(lojaIds: string[] | null, lojas: Map<string, { nome: string; canal: string }>): Promise<Pendencia[]> {
  let q = supabase
    .from("pedidos")
    .select("loja_id, marketplace, status, pedido_externo_id, dados_pedido")
    .in("status", ["READY_TO_SHIP", "PROCESSED", "AWAITING_SHIPMENT", "AWAITING_COLLECTION", "UNPAID"])
    .eq("pedido_efetivado", true)
    .limit(3000);
  if (lojaIds) q = q.in("loja_id", lojaIds);
  const { data } = await q;
  const grupos = new Map<string, { loja_id: string; canal: string; tipo: string; prazo: string | null; n: number; exemplos: string[] }>();
  for (const p of data || []) {
    const d = (p.dados_pedido as J) || {};
    let prazo: string | null = null;
    let tipo = "Postar";
    if (p.marketplace === "shopee") {
      if (!["READY_TO_SHIP", "PROCESSED"].includes(String(p.status))) continue;
      prazo = unixIso(d.ship_by_date);
    } else {
      if (p.status === "AWAITING_COLLECTION") {
        tipo = "Coleta";
        prazo = unixIso(d.collection_due_time);
      } else if (p.status === "AWAITING_SHIPMENT") {
        prazo = unixIso(d.rts_sla_time);
      } else continue;
    }
    if (!prazo) continue;
    const dia = prazo.slice(0, 13); // agrupa por loja + hora do prazo
    const k = `${p.loja_id}|${tipo}|${dia}`;
    const g = grupos.get(k) || { loja_id: p.loja_id, canal: p.marketplace === "tiktok_shop" ? "tiktok" : "shopee", tipo, prazo, n: 0, exemplos: [] as string[] };
    g.n++;
    if (g.exemplos.length < 3) g.exemplos.push(p.pedido_externo_id);
    grupos.set(k, g);
  }
  return [...grupos.values()].map((g) => ({
    prazo: g.prazo,
    urgencia: urgencia(g.prazo),
    canal: g.canal,
    loja_id: g.loja_id,
    titulo: `${g.n} pedido(s) ${g.tipo === "Coleta" ? "aguardando coleta" : "a postar"} · ${lojas.get(g.loja_id)?.nome ?? ""}`,
    detalhe: `${g.tipo === "Coleta" ? "janela de coleta" : "prazo de postagem"} ${fmtHora(g.prazo)} · ex.: ${g.exemplos.join(", ")}`,
    link: `/pedidos?loja=${g.loja_id}`,
    acao: g.tipo === "Coleta" ? "Resolver" : "Ver pedidos",
  }));
}

async function pendenciasAtrasados(lojaIds: string[] | null, lojas: Map<string, { nome: string; canal: string }>): Promise<Pendencia[]> {
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  let q = supabase.from("saude_pedidos_atrasados").select("loja_id, order_sn, shipping_deadline, late_by_days").eq("dia", hoje).limit(500);
  if (lojaIds) q = q.in("loja_id", lojaIds);
  const { data } = await q;
  const porLoja = new Map<string, { n: number; max: number; ex: string[] }>();
  for (const a of data || []) {
    const g = porLoja.get(a.loja_id) || { n: 0, max: 0, ex: [] as string[] };
    g.n++;
    g.max = Math.max(g.max, Number(a.late_by_days || 0));
    if (g.ex.length < 3) g.ex.push(a.order_sn);
    porLoja.set(a.loja_id, g);
  }
  return [...porLoja.entries()].map(([loja_id, g]) => ({
    prazo: new Date(Date.now() - 3600000).toISOString(), // já vencido
    urgencia: "agora" as const,
    canal: lojas.get(loja_id)?.canal ?? "shopee",
    loja_id,
    titulo: `${g.n} pedido(s) atrasado(s) para postar · ${lojas.get(loja_id)?.nome ?? ""}`,
    detalhe: `até ${g.max} dia(s) de atraso · podem gerar ponto de penalidade · ex.: ${g.ex.join(", ")}`,
    link: `/pedidos?loja=${loja_id}`,
    acao: "Resolver",
  }));
}

async function pendenciasChats(lojaIds: string[] | null, lojas: Map<string, { nome: string; canal: string }>): Promise<Pendencia[]> {
  let q = supabase.from("chat_conversas").select("loja_id, marketplace, ultima_mensagem_ts").eq("precisa_resposta", true).limit(2000);
  if (lojaIds) q = q.in("loja_id", lojaIds);
  const { data } = await q;
  const porLoja = new Map<string, { n: number; antigas: number; maisAntiga: number | null }>();
  for (const c of data || []) {
    const g = porLoja.get(c.loja_id) || { n: 0, antigas: 0, maisAntiga: null };
    g.n++;
    const ts = c.ultima_mensagem_ts ? new Date(c.ultima_mensagem_ts as string).getTime() : null;
    if (ts && Date.now() - ts > 3 * 3600000) g.antigas++;
    if (ts && (g.maisAntiga === null || ts < g.maisAntiga)) g.maisAntiga = ts;
    porLoja.set(c.loja_id, g);
  }
  return [...porLoja.entries()].map(([loja_id, g]) => {
    const prazo = g.maisAntiga ? new Date(g.maisAntiga + 12 * 3600000).toISOString() : null; // meta: responder em 12 h
    return {
      prazo,
      urgencia: g.antigas > 0 ? ("agora" as const) : urgencia(prazo),
      canal: lojas.get(loja_id)?.canal ?? "shopee",
      loja_id,
      titulo: `${g.n} chat(s) sem resposta · ${lojas.get(loja_id)?.nome ?? ""}`,
      detalhe: g.antigas ? `${g.antigas} há mais de 3 h · taxa de resposta conta na saúde da conta` : "resposta sugerida pelo robô aguardando",
      link: `/atendimento?loja=${loja_id}`,
      acao: "Responder",
    };
  });
}

async function pendenciasAvaliacoes(lojaIds: string[] | null, lojas: Map<string, { nome: string; canal: string }>): Promise<Pendencia[]> {
  let q = supabase.from("avaliacoes").select("loja_id, criado_em").lte("avaliacao", 2).eq("ja_respondida", false).limit(1000);
  if (lojaIds) q = q.in("loja_id", lojaIds);
  const { data } = await q;
  const porLoja = new Map<string, number>();
  for (const a of data || []) porLoja.set(a.loja_id, (porLoja.get(a.loja_id) || 0) + 1);
  const fimHoje = new Date();
  fimHoje.setHours(23, 59, 0, 0);
  return [...porLoja.entries()].map(([loja_id, n]) => ({
    prazo: fimHoje.toISOString(),
    urgencia: "hoje" as const,
    canal: lojas.get(loja_id)?.canal ?? "shopee",
    loja_id,
    titulo: `${n} avaliação(ões) de 1–2 estrelas sem resposta · ${lojas.get(loja_id)?.nome ?? ""}`,
    detalhe: "respostas sugeridas aguardando aprovação",
    link: `/avaliacoes?loja=${loja_id}`,
    acao: "Revisar",
  }));
}

async function pendenciasTokens(lojaIds: string[] | null, lojas: Map<string, { nome: string; canal: string }>): Promise<{ pend: Pendencia[]; integracoes: Integracao[] }> {
  let q = supabase.from("marketplace_tokens").select("loja_id, marketplace, expira_em, status").in("status", ["ativo", "expirado"]);
  if (lojaIds) q = q.in("loja_id", lojaIds);
  const { data } = await q;
  const pend: Pendencia[] = [];
  const integracoes: Integracao[] = [];
  for (const t of data || []) {
    const nome = `Token ${t.marketplace === "tiktok_shop" ? "TikTok" : "Shopee"} · ${lojas.get(t.loja_id)?.nome ?? ""}`;
    const exp = t.expira_em ? new Date(t.expira_em as string) : null;
    const dias = exp ? (exp.getTime() - Date.now()) / 86400000 : null;
    const ok = t.status === "ativo" && (dias === null || dias > 3);
    integracoes.push({ nome, ok, texto: t.status !== "ativo" ? "expirado: reconectar em Integrações" : dias === null ? "ativo" : dias <= 0 ? "venceu" : `vence em ${Math.ceil(dias)} dia(s)` });
    if (!ok) pend.push({ prazo: exp?.toISOString() ?? null, urgencia: t.status !== "ativo" || (dias !== null && dias <= 0) ? "agora" : urgencia(exp?.toISOString() ?? null), canal: t.marketplace === "tiktok_shop" ? "tiktok" : "shopee", loja_id: t.loja_id, titulo: `${nome} ${t.status !== "ativo" ? "expirado" : "vencendo"}`, detalhe: "sem token os robôs param", link: "/integracoes", acao: "Reconectar" });
  }
  return { pend, integracoes };
}

async function saudeContas(lojaIds: string[] | null, lojas: Map<string, { nome: string; canal: string }>): Promise<{ saude: SaudeLoja[]; pend: Pendencia[] }> {
  let q = supabase.from("saude_conta_snapshot").select("loja_id, dia, rating, metricas_fora, pedidos_atrasados, pontos_penalidade, punicoes_ativas").order("dia", { ascending: false }).limit(50);
  if (lojaIds) q = q.in("loja_id", lojaIds);
  const { data } = await q;
  const vistos = new Set<string>();
  const saude: SaudeLoja[] = [];
  const pend: Pendencia[] = [];
  for (const s of data || []) {
    if (vistos.has(s.loja_id)) continue;
    vistos.add(s.loja_id);
    const { data: fora } = await supabase.from("saude_metricas").select("nome, atual, alvo").eq("loja_id", s.loja_id).eq("dia", s.dia).eq("fora_da_meta", true).limit(6);
    const l = lojas.get(s.loja_id);
    saude.push({ loja_id: s.loja_id, nome: l?.nome ?? s.loja_id.slice(0, 8), canal: l?.canal ?? "shopee", rating: s.rating, metricas_fora: Number(s.metricas_fora || 0), pedidos_atrasados: Number(s.pedidos_atrasados || 0), pontos: Number(s.pontos_penalidade || 0), punicoes: Number(s.punicoes_ativas || 0), dia: s.dia, fora: (fora || []).map((f) => ({ nome: f.nome, atual: f.atual == null ? null : String(f.atual), alvo: f.alvo == null ? null : String(f.alvo) })) });
    if (Number(s.punicoes_ativas || 0) > 0 || Number(s.metricas_fora || 0) > 0) {
      pend.push({ prazo: null, urgencia: Number(s.punicoes_ativas || 0) > 0 ? "agora" : "hoje", canal: l?.canal ?? "shopee", loja_id: s.loja_id, titulo: `Saúde da conta · ${l?.nome ?? ""}: ${Number(s.punicoes_ativas || 0) > 0 ? `${s.punicoes_ativas} punição(ões) ativa(s)` : `${s.metricas_fora} métrica(s) fora da meta`}`, detalhe: (fora || []).map((f) => `${f.nome} ${f.atual ?? ""}/${f.alvo ?? ""}`).join(" · ") || "ver detalhes", link: `/saude?loja=${s.loja_id}`, acao: "Ver saúde" });
    }
  }
  return { saude, pend };
}

async function conferencias(lojaIds: string[] | null): Promise<Conferencia[]> {
  const out: Conferencia[] = [];
  try {
    const { data } = await supabase.rpc("conferencia_pedido_fecha", { p_loja_ids: lojaIds, p_inicio: null, p_fim: null });
    const r = (data as J) || {};
    const dif = Number(r.diferenca || 0);
    out.push({ nome: "Pedido fecha com o repasse", ok: dif === 0, texto: dif === 0 ? `OK · ${Number(r.ok || 0).toLocaleString("pt-BR")} pedidos` : `${dif} diferença(s) · R$ ${Number(r.diferenca_valor || 0).toFixed(2)}` });
    const desconhecidos = Array.isArray(r.campos_desconhecidos) ? (r.campos_desconhecidos as J[]).length : 0;
    out.push({ nome: "Campo novo no escrow", ok: desconhecidos === 0, texto: desconhecidos ? `${desconhecidos} regra(s) de taxa sem categoria` : "nenhum" });
  } catch {
    out.push({ nome: "Pedido fecha com o repasse", ok: false, texto: "não conferido" });
  }
  try {
    const { data } = await supabase.rpc("conferencia_carteira_desconhecidos", { p_loja_ids: lojaIds });
    const lista = Array.isArray(data) ? (data as J[]) : [];
    out.push({ nome: "Tipo novo na carteira", ok: lista.length === 0, texto: lista.length ? `${lista.length} tipo(s) desconhecido(s)` : "nenhum" });
  } catch {
    /* função opcional */
  }
  return out;
}

async function resolvidos(lojaIds: string[] | null, inicio: Date, fim: Date): Promise<number> {
  const ini = inicio.toISOString();
  const end = fim.toISOString();
  const [c, a, d] = await Promise.all([
    (() => {
      let q = supabase.from("chat_conversas").select("conversation_id", { count: "exact", head: true }).gte("respondida_em", ini).lt("respondida_em", end);
      if (lojaIds) q = q.in("loja_id", lojaIds);
      return q;
    })(),
    (() => {
      let q = supabase.from("avaliacoes").select("id", { count: "exact", head: true }).gte("respondida_em", ini).lt("respondida_em", end);
      if (lojaIds) q = q.in("loja_id", lojaIds);
      return q;
    })(),
    (() => {
      const q = supabase.from("devolucao_eventos").select("id", { count: "exact", head: true }).in("origem", ["equipe", "assistente"]).gte("quando", ini).lt("quando", end);
      return q;
    })(),
  ]);
  return (c.count ?? 0) + (a.count ?? 0) + (d.count ?? 0);
}

export async function montarPainel(lojaIds: string[] | null, extras: { estoque?: () => Promise<Pendencia[]>; campanhas?: () => Promise<Pendencia[]> } = {}): Promise<Painel> {
  const lojas = await nomesLojas(lojaIds);
  const hoje0 = new Date();
  hoje0.setHours(0, 0, 0, 0);
  const ontem0 = new Date(hoje0.getTime() - 86400000);
  const [postagem, atrasados, chats, avaliacoes, tokens, saude, confs, devolucoes, estoque, campanhas, resolvidosHoje, resolvidosOntem] = await Promise.all([
    pendenciasPostagem(lojaIds, lojas),
    pendenciasAtrasados(lojaIds, lojas),
    pendenciasChats(lojaIds, lojas),
    pendenciasAvaliacoes(lojaIds, lojas),
    pendenciasTokens(lojaIds, lojas),
    saudeContas(lojaIds, lojas),
    conferencias(lojaIds),
    pendenciasDevolucoes(lojaIds),
    extras.estoque ? extras.estoque().catch(() => []) : Promise.resolve([] as Pendencia[]),
    extras.campanhas ? extras.campanhas().catch(() => []) : Promise.resolve([] as Pendencia[]),
    resolvidos(lojaIds, hoje0, new Date(hoje0.getTime() + 86400000)),
    resolvidos(lojaIds, ontem0, hoje0),
  ]);
  const ordem: Record<Urgencia, number> = { agora: 0, hoje: 1, amanha: 2, depois: 3 };
  const pendencias = [...atrasados, ...postagem, ...chats, ...avaliacoes, ...tokens.pend, ...saude.pend, ...devolucoes, ...estoque, ...campanhas].sort((a, b) => ordem[a.urgencia] - ordem[b.urgencia] || (a.prazo && b.prazo ? a.prazo.localeCompare(b.prazo) : a.prazo ? -1 : 1));
  const contagem: Record<Urgencia, number> = { agora: 0, hoje: 0, amanha: 0, depois: 0 };
  for (const p of pendencias) contagem[p.urgencia]++;
  confs.push({ nome: "Devoluções vencendo em 24 h", ok: devolucoes.filter((d) => d.urgencia === "agora" || d.urgencia === "hoje").length === 0, texto: `${devolucoes.length} pendente(s)` });
  return { geradoEm: new Date().toISOString(), pendencias, contagem, resolvidosHoje, resolvidosOntem, saude: saude.saude, conferencias: confs, integracoes: tokens.integracoes };
}
