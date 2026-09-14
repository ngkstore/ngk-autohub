import { supabase } from "@/lib/supabase";
import { obterToken, chamar } from "@/lib/shopee/adsColetor";
import { editarCampanhaProduto } from "@/lib/shopee/adsEditar";
import { enviarTelegram } from "@/lib/telegram";

// Reforço automático de orçamento do dia.
// Regra do Gabriel: enquanto o anúncio estiver performando, tem que ter combustível.
// A cada 30 min: lê o gasto de HOJE por hora (get_product_campaign_hourly_performance
// aceita o dia corrente), e se a campanha está perto de esgotar o orçamento com ROAS
// (7d e de hoje) acima do mínimo, sobe +30% (mín R$50). Sem limite de vezes por dia —
// só o teto diário da loja (lojas.ads_reforco_teto_dia) e o piso de saldo
// (lojas.ads_reforco_saldo_min). À meia-noite (reverterLoja) volta ao orçamento base.

type Tok = { at: string; shop: string };
type Row = Record<string, unknown>;
type PerfHoje = { gasto: number; gmv: number; pedidos: number; porHora: Record<number, number> };

export type Decisao = {
  campaignId: number;
  itemId: number | null;
  produto: string;
  orcamento: number;
  gastoHoje: number;
  pctUsado: number;
  ritmoHora: number;
  roasHoje: number | null;
  roas7d: number | null;
  roasMin: number | null;
  classificacao: string | null;
  acao: "reforcar" | "ignorar";
  motivo: string;
  novo?: number;
  sucesso?: boolean;
  erro?: string;
};

const n = (v: unknown) => Number(v || 0);
const brl = (v: number) => `R$${Math.round(v).toLocaleString("pt-BR")}`;
const x1 = (v: number | null) => (v == null ? "—" : `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}×`);
export const hojeBRT = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
export const horaBRT = () =>
  Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", hour: "2-digit", hour12: false }).format(new Date())) % 24;
const ddmmyyyy = (iso: string) => iso.split("-").reverse().join("-");
const ontemBRT = () => {
  const [y, m, d] = hojeBRT().split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
};

// Performance por hora de um dia (hoje ou passado), por campanha, em lotes de 100.
async function perfDoDia(tok: Tok, campaignIds: number[], diaIso: string): Promise<Map<number, PerfHoje>> {
  const out = new Map<number, PerfHoje>();
  for (let i = 0; i < campaignIds.length; i += 100) {
    const ids = campaignIds.slice(i, i + 100).join(",");
    const r = await chamar(
      "/api/v2/ads/get_product_campaign_hourly_performance",
      tok,
      `&campaign_id_list=${ids}&performance_date=${ddmmyyyy(diaIso)}`
    );
    if (r.error) throw new Error(`hourly: ${String(r.error)} ${String(r.message || "")}`);
    const resp = r.response as unknown;
    const shops = Array.isArray(resp) ? (resp as Row[]) : resp ? [resp as Row] : [];
    for (const s of shops) {
      for (const c of ((s.campaign_list as Row[]) || [])) {
        const p: PerfHoje = { gasto: 0, gmv: 0, pedidos: 0, porHora: {} };
        for (const m of ((c.metrics_list as Row[]) || [])) {
          const e = n(m.expense);
          p.gasto += e;
          p.gmv += n(m.direct_gmv);
          p.pedidos += n(m.direct_order);
          p.porHora[n(m.hour)] = (p.porHora[n(m.hour)] || 0) + e;
        }
        out.set(n(c.campaign_id), p);
      }
    }
  }
  return out;
}

async function nomesProdutos(lojaId: string, itemIds: number[]): Promise<Record<number, string>> {
  if (!itemIds.length) return {};
  const { data } = await supabase.from("produtos").select("item_id, nome").eq("loja_id", lojaId).in("item_id", itemIds.map(String));
  return Object.fromEntries(((data as Row[]) || []).map((p) => [Number(p.item_id), String(p.nome || "")]));
}

async function lojaInfo(lojaId: string) {
  const { data } = await supabase
    .from("lojas")
    .select("id, nome, apelido, nome_publico, ads_reforco_auto, ads_reforco_saldo_min, ads_reforco_teto_dia")
    .eq("id", lojaId)
    .maybeSingle();
  const l = (data as Row) || {};
  return {
    nome: String(l.nome_publico || l.apelido || l.nome || lojaId),
    ligado: l.ads_reforco_auto === true,
    saldoMin: l.ads_reforco_saldo_min != null ? n(l.ads_reforco_saldo_min) : 300,
    tetoDia: l.ads_reforco_teto_dia != null ? n(l.ads_reforco_teto_dia) : 2000,
  };
}

async function registrarAjuste(lojaId: string, campaignId: number, itemId: number | null, antigo: number, novo: number, r: { reference_id?: string; simulado: boolean; sucesso: boolean; resposta?: Row; body?: Row; erro?: string }, usuario: string) {
  await supabase.from("ads_ajustes").insert({
    loja_id: lojaId, campaign_id: campaignId, item_id: itemId, campo: "orcamento",
    valor_antigo: antigo, valor_novo: novo, reference_id: r.reference_id ?? null,
    simulado: r.simulado, sucesso: r.sucesso, resposta: r.resposta ?? r.body ?? { erro: r.erro }, usuario,
  });
}

// ---------------------------------------------------------------------------
export async function reforcarLoja(lojaId: string, dry = false) {
  const loja = await lojaInfo(lojaId);
  const hoje = hojeBRT();
  const hora = horaBRT();
  const tok = await obterToken(lojaId);
  if (!tok) return { loja: loja.nome, erro: "sem token ativo", decisoes: [] as Decisao[] };

  // Campanhas ativas de hoje com orçamento limitado (0 = sem limite, nada a reforçar).
  const { data: cfgRaw } = await supabase
    .from("ads_campaign_config_daily")
    .select("campaign_id, item_id, orcamento, meta_roas")
    .eq("loja_id", lojaId).eq("dia", hoje).eq("status", "ongoing").gt("orcamento", 0);
  const cfgs = (cfgRaw as Row[]) || [];
  if (!cfgs.length) return { loja: loja.nome, hora, saldo: null, decisoes: [] as Decisao[], reforcados: 0, aviso: "sem snapshot de hoje" };

  const [{ data: recRaw }, { data: refRaw }, bal] = await Promise.all([
    supabase.from("ads_recomendacoes").select("item_id, campaign_id, classificacao, roas_real, roas_minimo, fator").eq("loja_id", lojaId).eq("dia", hoje),
    supabase.from("ads_reforcos").select("*").eq("loja_id", lojaId).eq("dia", hoje),
    chamar("/api/v2/ads/get_total_balance", tok),
  ]);
  const recs = (recRaw as Row[]) || [];
  const refs = (refRaw as Row[]) || [];
  const saldoRaw = (bal.response as Row | undefined)?.total_balance;
  const saldo = saldoRaw != null ? n(saldoRaw) : null;

  const perf = await perfDoDia(tok, cfgs.map((c) => n(c.campaign_id)), hoje);
  const nomes = await nomesProdutos(lojaId, cfgs.map((c) => n(c.item_id)).filter(Boolean));
  let tetoRestante = loja.tetoDia - refs.reduce((s, r) => s + (n(r.orcamento_atual) - n(r.orcamento_base)), 0);

  const decisoes: Decisao[] = [];
  let bloqueadosPorSaldo = 0;
  for (const c of cfgs) {
    const campaignId = n(c.campaign_id);
    const itemId = c.item_id != null ? n(c.item_id) : null;
    const p = perf.get(campaignId);
    const orc = n(c.orcamento);
    const gasto = p?.gasto ?? 0;
    const pct = orc > 0 ? gasto / orc : 0;
    const ritmo = Math.max(p?.porHora[hora - 1] ?? 0, p?.porHora[hora - 2] ?? 0); // última(s) hora(s) completa(s)
    const rec = recs.find((r) => n(r.campaign_id) === campaignId) || recs.find((r) => itemId != null && n(r.item_id) === itemId);
    const roasMin = rec?.roas_minimo != null ? n(rec.roas_minimo) : null;
    const roas7 = rec?.roas_real != null ? n(rec.roas_real) : null;
    const fator = rec?.fator != null ? n(rec.fator) : 1;
    const roasHoje = p && gasto > 0 ? (p.gmv / gasto) * fator : null;
    const d: Decisao = {
      campaignId, itemId, produto: (itemId != null && nomes[itemId]) || `item ${itemId ?? "?"}`,
      orcamento: orc, gastoHoje: Math.round(gasto * 100) / 100, pctUsado: Math.round(pct * 100), ritmoHora: Math.round(ritmo * 100) / 100,
      roasHoje: roasHoje != null ? Math.round(roasHoje * 10) / 10 : null, roas7d: roas7, roasMin,
      classificacao: rec ? String(rec.classificacao) : null, acao: "ignorar", motivo: "",
    };
    decisoes.push(d);

    const gatilho = pct >= 0.8 || (ritmo > 0 && gasto + ritmo >= orc);
    if (!gatilho) { d.motivo = `gasto ${d.pctUsado}% do orçamento`; continue; }
    if (!rec) { d.motivo = "perto do teto, mas sem recomendação de hoje (sem ROAS mínimo pra julgar)"; continue; }
    if (["abaixo_do_minimo", "sem_margem"].includes(d.classificacao || "")) { d.motivo = `perto do teto, mas classificado como ${d.classificacao}`; continue; }
    if (roasMin == null || roas7 == null) { d.motivo = "perto do teto, mas sem ROAS mínimo"; continue; }
    if (roas7 < roasMin) { d.motivo = `perto do teto, mas ROAS 7d ${x1(roas7)} < mínimo ${x1(roasMin)}`; continue; }
    if (gasto >= 20 && roasHoje != null && roasHoje < roasMin) { d.motivo = `perto do teto, mas ROAS de hoje ${x1(roasHoje)} < mínimo ${x1(roasMin)}`; continue; }
    if (saldo != null && saldo < loja.saldoMin) { d.motivo = `perto do teto com ROAS bom, mas saldo Ads ${brl(saldo)} < piso ${brl(loja.saldoMin)}`; bloqueadosPorSaldo++; continue; }
    const inc = Math.max(50, Math.round(orc * 0.3));
    if (inc > tetoRestante) { d.motivo = `perto do teto com ROAS bom, mas teto diário de reforço da loja (${brl(loja.tetoDia)}) esgotado`; continue; }

    const novo = orc + inc;
    d.acao = "reforcar"; d.novo = novo;
    d.motivo = `gasto ${d.pctUsado}% (${brl(gasto)}) às ${hora}h, ritmo ${brl(ritmo)}/h, ROAS hoje ${x1(roasHoje)} · 7d ${x1(roas7)} ≥ mín ${x1(roasMin)}`;
    const [r] = await editarCampanhaProduto({ lojaId, campaignId, acoes: [{ campo: "orcamento", valor: novo }], simular: dry });
    d.sucesso = r.sucesso; d.erro = r.erro;
    if (dry) continue;
    await registrarAjuste(lojaId, campaignId, itemId, orc, novo, r, "automacao");
    if (!r.sucesso) continue;
    tetoRestante -= inc;
    const atual = refs.find((x) => n(x.campaign_id) === campaignId);
    const hist = Array.isArray(atual?.historico) ? (atual!.historico as Row[]) : [];
    await supabase.from("ads_reforcos").upsert(
      {
        loja_id: lojaId, campaign_id: campaignId, item_id: itemId, dia: hoje,
        orcamento_base: atual ? n(atual.orcamento_base) : orc,
        orcamento_atual: novo, reforcos: (atual ? n(atual.reforcos) : 0) + 1,
        historico: [...hist, { hora, de: orc, para: novo, gasto: d.gastoHoje, roas_hoje: d.roasHoje }],
        ultimo_em: new Date().toISOString(), revertido_em: null, reversao_erro: null,
      },
      { onConflict: "loja_id,campaign_id,dia" }
    );
    await supabase.from("ads_campaign_config_daily").update({ orcamento: novo }).eq("loja_id", lojaId).eq("campaign_id", campaignId).eq("dia", hoje);
  }

  const feitos = decisoes.filter((d) => d.acao === "reforcar" && d.sucesso);
  const falhos = decisoes.filter((d) => d.acao === "reforcar" && !d.sucesso);
  if (!dry && (feitos.length || falhos.length)) {
    const L = [`⚡ Reforço de orçamento · ${loja.nome} (${hora}h)`];
    for (const d of feitos) L.push(`• ${d.produto.slice(0, 45)}: ${brl(d.orcamento)} → ${brl(d.novo!)} · ${d.motivo}`);
    for (const d of falhos) L.push(`✗ ${d.produto.slice(0, 45)}: falhou (${d.erro || "erro"})`);
    L.push(`Saldo Ads: ${saldo != null ? brl(saldo) : "—"} · volta ao orçamento base à meia-noite`);
    await enviarTelegram(L.join("\n"));
  }
  if (!dry && bloqueadosPorSaldo > 0) {
    // aviso 1× por dia por loja
    const { error } = await supabase.from("ads_reforco_avisos").insert({ loja_id: lojaId, dia: hoje, tipo: "saldo" });
    if (!error) {
      await enviarTelegram(`⚠️ ${loja.nome}: ${bloqueadosPorSaldo} anúncio(s) batendo no teto do orçamento com ROAS bom, mas o saldo de Ads está em ${brl(saldo ?? 0)} (piso ${brl(loja.saldoMin)}). Recarregue pra o reforço automático agir.`);
    }
  }
  return { loja: loja.nome, hora, saldo, reforcados: feitos.length, decisoes };
}

// ---------------------------------------------------------------------------
// Reversão: todo reforço de dias anteriores ainda não revertido volta ao orçamento base.
export async function reverterLoja(lojaId: string, dry = false) {
  const loja = await lojaInfo(lojaId);
  const hoje = hojeBRT();
  const { data: refRaw } = await supabase
    .from("ads_reforcos").select("*").eq("loja_id", lojaId).is("revertido_em", null).lt("dia", hoje).order("dia");
  const refs = (refRaw as Row[]) || [];
  if (!refs.length) return { loja: loja.nome, revertidos: 0, itens: [] as Row[] };
  const tok = await obterToken(lojaId);
  if (!tok) return { loja: loja.nome, erro: "sem token ativo", revertidos: 0, itens: [] as Row[] };

  // Fechamento do dia (gasto/GMV) das campanhas reforçadas, pra prestar contas.
  const ontem = ontemBRT();
  let perf = new Map<number, PerfHoje>();
  try { perf = await perfDoDia(tok, refs.filter((r) => String(r.dia) === ontem).map((r) => n(r.campaign_id)), ontem); } catch { /* só informativo */ }
  const nomes = await nomesProdutos(lojaId, refs.map((r) => n(r.item_id)).filter(Boolean));

  const itens: Row[] = [];
  for (const r of refs) {
    const campaignId = n(r.campaign_id), base = n(r.orcamento_base), atual = n(r.orcamento_atual);
    const [res] = await editarCampanhaProduto({ lojaId, campaignId, acoes: [{ campo: "orcamento", valor: base }], simular: dry });
    const p = perf.get(campaignId);
    const it: Row = { campaign_id: campaignId, produto: nomes[n(r.item_id)] || `item ${r.item_id}`, dia: r.dia, base, atual, reforcos: r.reforcos, sucesso: res.sucesso, erro: res.erro, gasto: p?.gasto, gmv: p?.gmv };
    itens.push(it);
    if (dry) continue;
    await registrarAjuste(lojaId, campaignId, r.item_id != null ? n(r.item_id) : null, atual, base, res, "automacao (reversão)");
    if (res.sucesso) {
      await supabase.from("ads_reforcos").update({ revertido_em: new Date().toISOString(), reversao_erro: null }).eq("id", r.id);
      // o snapshot do dia volta ao base (relógio de alterações não vê o reforço como mudança)
      await supabase.from("ads_campaign_config_daily").update({ orcamento: base }).eq("loja_id", lojaId).eq("campaign_id", campaignId).eq("dia", String(r.dia));
    } else {
      await supabase.from("ads_reforcos").update({ reversao_erro: res.erro || "erro" }).eq("id", r.id);
    }
  }
  if (!dry) {
    const L = [`🌙 Reforços revertidos · ${loja.nome}`];
    for (const it of itens) {
      const g = it.gasto != null ? n(it.gasto) : null, gmv = it.gmv != null ? n(it.gmv) : null;
      L.push(`${it.sucesso ? "•" : "✗"} ${String(it.produto).slice(0, 45)}: volta a ${brl(n(it.base))} (chegou a ${brl(n(it.atual))}, ${it.reforcos}× reforço)` +
        (g != null ? ` · dia: gasto ${brl(g)}, GMV ${brl(gmv || 0)}, ROAS ${x1(g > 0 ? (gmv || 0) / g : 0)}` : "") +
        (it.sucesso ? "" : ` · FALHOU: ${it.erro}`));
    }
    await enviarTelegram(L.join("\n"));
  }
  return { loja: loja.nome, revertidos: itens.filter((i) => i.sucesso).length, itens };
}
