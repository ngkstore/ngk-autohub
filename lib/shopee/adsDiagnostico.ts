import { supabase } from "@/lib/supabase";

// Diagnóstico semanal do ROAS (GMV Max): lê a RPC ads_diagnostico_roas (decomposição
// exata da variação do ROAS por item) e explica, em português, POR QUE cada item
// derrubou ou puxou o ROAS geral e O QUE fazer. Usado pelo relatório semanal
// (Telegram) e pela página /ads-controle.

export type AlteracaoDiag = { dia: string; campo: string; de: string | null; para: string | null };

export type ItemDiag = {
  loja_id: string; item_id: number; produto: string | null;
  gasto_atual: number; gasto_anterior: number; gmv_atual: number; gmv_anterior: number;
  roas_atual: number | null; roas_anterior: number | null;
  ctr_atual: number | null; ctr_anterior: number | null;
  cr_atual: number | null; cr_anterior: number | null;
  cpc_atual: number | null; cpc_anterior: number | null;
  pedidos_atual: number; pedidos_anterior: number;
  contrib: number; contrib_efic: number; contrib_mix: number;
  classificacao: string | null; acao: string | null;
  meta_roas: number | null; meta_sugerida: number | null; roas_minimo: number | null; fator: number | null;
  promo: boolean; orcamento_configurado: number | null; orcamento_ideal: number | null;
  alteracoes: AlteracaoDiag[];
};

export type ItemExplicado = ItemDiag & {
  tipo: "eficiencia" | "mix" | "novo" | "sumiu";
  motivo: string;       // por que mexeu no ROAS geral
  recomendacao: string; // o que fazer
};

export type Totais = { gasto: number; gmv: number; roas: number | null };

export type DiagnosticoRoas = {
  periodo: { atual_ini: string; atual_fim: string; ant_ini: string; ant_fim: string; dias: number };
  atual: Totais; anterior: Totais; delta_roas: number | null;
  derrubaram: ItemExplicado[]; // contribuição negativa, maior primeiro
  puxaram: ItemExplicado[];    // contribuição positiva, maior primeiro
  sumiram: ItemExplicado[];    // gastavam na semana anterior e zeraram
  resumo: string;              // 1 frase: o que explica a maior parte da variação
};

const n = (v: unknown) => Number(v || 0);
export const brl = (v: unknown) => n(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
export const x1 = (v: unknown) => `${n(v).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}×`;
const pc = (v: unknown) => `${(n(v) * 100).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
const dd = (iso: string) => { const [, m, d] = String(iso).split("-"); return `${d}/${m}`; };
// variação % entre anterior (b) e atual (a); null se não dá pra comparar
const varPct = (a: number | null, b: number | null) => (a != null && b != null && b > 0 ? ((a - b) / b) * 100 : null);
const sinal = (v: number) => `${v >= 0 ? "+" : "−"}${x1(Math.abs(v))}`;

// Classificações em que a ação do motor já é a recomendação certa.
const ACOES_MOTOR = new Set([
  "abaixo_do_minimo", "retomar_meta", "problema_anuncio", "problema_pagina", "meta_nao_entregue",
  "orcamento_esgotando", "pronto_proximo_degrau", "meta_desalinhada",
]);

function descreverAlteracoes(alts: AlteracaoDiag[]): string[] {
  const out: string[] = [];
  for (const a of alts || []) {
    if (a.campo === "meta_roas") out.push(`meta ${x1(a.de)} → ${x1(a.para)} em ${dd(a.dia)}`);
    else if (a.campo === "orcamento") out.push(`orçamento ${brl(a.de)} → ${brl(a.para)} em ${dd(a.dia)}`);
    else if (a.campo === "status") out.push(`status ${a.de || "?"} → ${a.para || "?"} em ${dd(a.dia)}`);
  }
  return out;
}

function explicar(x: ItemDiag, roasMedioAnterior: number | null): ItemExplicado {
  const caiu = x.contrib < 0;
  const novo = x.gasto_anterior <= 0 && x.gasto_atual > 0;
  const sumiu = x.gasto_atual <= 0 && x.gasto_anterior > 0;
  const eficDomina = Math.abs(x.contrib_efic) >= Math.abs(x.contrib_mix);
  const dCtr = varPct(x.ctr_atual, x.ctr_anterior);
  const dCr = varPct(x.cr_atual, x.cr_anterior);
  const dCpc = varPct(x.cpc_atual, x.cpc_anterior);
  const abaixoMin = x.roas_minimo != null && x.roas_atual != null && n(x.roas_atual) * n(x.fator || 1) < n(x.roas_minimo);
  const alts = descreverAlteracoes(x.alteracoes);
  const causas: string[] = [];
  let tipo: ItemExplicado["tipo"] = eficDomina ? "eficiencia" : "mix";
  const flags = { crCaiu: false, ctrCaiu: false, cpcSubiu: false, perdeuVolumeBom: false };

  if (novo) {
    tipo = "novo";
    causas.push(`item novo/reativado: não gastava na semana anterior; ROAS ${x1(x.roas_atual)} vs média anterior da loja ${x1(roasMedioAnterior)}`);
  } else if (sumiu) {
    tipo = "sumiu";
    causas.push(`parou de gastar (tinha ${brl(x.gasto_anterior)} com ROAS ${x1(x.roas_anterior)})`);
  } else if (eficDomina) {
    // O ROAS do próprio item mudou.
    if (caiu) {
      if (dCr != null && dCr <= -15) { flags.crCaiu = true; causas.push(`conversão caiu ${Math.abs(dCr).toFixed(0)}% (${pc(x.cr_anterior)} → ${pc(x.cr_atual)})`); }
      if (dCtr != null && dCtr <= -15) { flags.ctrCaiu = true; causas.push(`CTR caiu ${Math.abs(dCtr).toFixed(0)}% (${pc(x.ctr_anterior)} → ${pc(x.ctr_atual)})`); }
      if (dCpc != null && dCpc >= 15) { flags.cpcSubiu = true; causas.push(`clique ficou ${dCpc.toFixed(0)}% mais caro (CPC R$${n(x.cpc_anterior).toFixed(2)} → R$${n(x.cpc_atual).toFixed(2)})`); }
      if (x.promo) causas.push("em promoção (ticket menor derruba o GMV por clique)");
      if (!causas.length) causas.push(`ROAS caiu de ${x1(x.roas_anterior)} pra ${x1(x.roas_atual)} sem mudança clara de CTR/conversão/CPC (ticket ou mix de variações vendidas)`);
    } else {
      if (dCr != null && dCr >= 15) causas.push(`conversão subiu ${dCr.toFixed(0)}% (${pc(x.cr_anterior)} → ${pc(x.cr_atual)})`);
      if (dCtr != null && dCtr >= 15) causas.push(`CTR subiu ${dCtr.toFixed(0)}%`);
      if (dCpc != null && dCpc <= -15) causas.push(`clique ${Math.abs(dCpc).toFixed(0)}% mais barato`);
      if (!causas.length) causas.push(`ROAS subiu de ${x1(x.roas_anterior)} pra ${x1(x.roas_atual)}`);
    }
  } else {
    // Mix: o peso do item no gasto total mudou.
    const dGasto = varPct(x.gasto_atual, x.gasto_anterior);
    const gastoTxt = `${brl(x.gasto_anterior)} → ${brl(x.gasto_atual)}`;
    if (caiu) {
      causas.push(dGasto != null && dGasto > 10
        ? `gasto subiu ${dGasto.toFixed(0)}% (${gastoTxt}) num item com ROAS abaixo da média (${x1(x.roas_atual)} vs ${x1(roasMedioAnterior)})`
        : `item com ROAS abaixo da média (${x1(x.roas_atual)} vs ${x1(roasMedioAnterior)}) ganhou peso no gasto total (${gastoTxt})`);
    } else {
      if (dGasto != null && dGasto > 10) causas.push(`gasto subiu ${dGasto.toFixed(0)}% (${gastoTxt}) num item com ROAS acima da média (${x1(x.roas_atual)} vs ${x1(roasMedioAnterior)})`);
      else if (dGasto != null && dGasto < -10) { flags.perdeuVolumeBom = true; causas.push(`gasto caiu ${Math.abs(dGasto).toFixed(0)}% (${gastoTxt}) num item com ROAS acima da média (${x1(x.roas_atual)} vs ${x1(roasMedioAnterior)}) — ajuda o ROAS geral, mas perdeu volume rentável`); }
      else causas.push(`item com ROAS acima da média (${x1(x.roas_atual)} vs ${x1(roasMedioAnterior)}) mantém peso no gasto (${gastoTxt})`);
    }
  }
  if (alts.length) causas.push(`alterações: ${alts.join("; ")}`);

  // Recomendação: a ação do motor quando ele já classificou o item; senão pela causa.
  let rec: string;
  const ideal = x.orcamento_ideal != null && n(x.orcamento_ideal) > 0 ? ` (ideal ${brl(x.orcamento_ideal)})` : "";
  if (x.classificacao && ACOES_MOTOR.has(x.classificacao) && x.acao) {
    rec = x.acao;
  } else if (sumiu) {
    rec = x.classificacao === "abaixo_do_minimo"
      ? "estava no prejuízo: manter parado"
      : `estava rentável (${x1(x.roas_anterior)}): conferir se foi pausado, ficou sem orçamento ou sem estoque — se foi sem querer, reativar`;
  } else if (novo) {
    rec = abaixoMin
      ? "ainda em teste: não mexer na meta; se seguir abaixo do mínimo depois de 14 dias, pausar"
      : `está pagando: manter e dar orçamento${ideal}`;
  } else if (caiu) {
    if (flags.crCaiu) rec = "revisar a página: preço vs concorrentes, estoque das variações, avaliações e fotos recentes";
    else if (flags.ctrCaiu) rec = "revisar o anúncio: imagem principal, título e preço mostrado (concorrência no mesmo termo)";
    else if (flags.cpcSubiu) rec = abaixoMin ? "leilão ficou caro e o item está abaixo do mínimo: baixar a meta em degrau (−15%) ou reduzir orçamento até o CPC normalizar" : "clique mais caro, mas ainda rentável: manter e observar mais uma semana";
    else if (x.promo) rec = "efeito da promoção: reavaliar quando o preço voltar ao normal";
    else if (tipo === "mix") rec = `reduzir o orçamento desse item${ideal} e realocar pros campeões`;
    else rec = "manter e observar mais uma semana; se cair de novo, baixar o orçamento";
  } else if (flags.perdeuVolumeBom) {
    rec = `item rentável gastando menos: conferir orçamento/teto e estoque e devolver o combustível${ideal}`;
  } else {
    rec = x.classificacao === "campeao" || x.classificacao === "saudavel"
      ? `está puxando o ROAS pra cima: escalar o orçamento${ideal}`
      : "manter";
  }

  return { ...x, tipo, motivo: causas.join(" · "), recomendacao: rec };
}

export async function obterDiagnosticoRoas(lojaIds: string[] | null, dias = 7): Promise<DiagnosticoRoas | null> {
  const { data, error } = await supabase.rpc("ads_diagnostico_roas", { p_loja_ids: lojaIds, p_dias: dias });
  if (error || !data) return null;
  const d = data as { periodo: DiagnosticoRoas["periodo"]; atual: Totais; anterior: Totais; delta_roas: number | null; itens: ItemDiag[] };
  const itens = (d.itens || []).map((i) => ({
    ...i,
    gasto_atual: n(i.gasto_atual), gasto_anterior: n(i.gasto_anterior),
    contrib: n(i.contrib), contrib_efic: n(i.contrib_efic), contrib_mix: n(i.contrib_mix),
    alteracoes: Array.isArray(i.alteracoes) ? i.alteracoes : [],
  }));
  if (!itens.length || !d.anterior?.roas) return null;
  const roasAnt = n(d.anterior.roas);
  const explicados = itens.map((i) => explicar(i, roasAnt));
  const derrubaram = explicados.filter((i) => i.contrib < -0.05 && i.tipo !== "sumiu").sort((a, b) => a.contrib - b.contrib);
  const puxaram = explicados.filter((i) => i.contrib > 0.05 && i.tipo !== "sumiu").sort((a, b) => b.contrib - a.contrib);
  const sumiram = explicados.filter((i) => i.tipo === "sumiu").sort((a, b) => b.gasto_anterior - a.gasto_anterior);

  // Resumo: o que explica a maior parte da variação (eficiência × mix).
  const delta = n(d.delta_roas);
  const efic = explicados.reduce((s, i) => s + i.contrib_efic, 0);
  const mix = explicados.reduce((s, i) => s + i.contrib_mix, 0);
  let resumo: string;
  if (Math.abs(delta) < 0.5) resumo = `ROAS estável (${x1(d.anterior.roas)} → ${x1(d.atual.roas)}).`;
  else {
    const dir = delta < 0 ? "caiu" : "subiu";
    const principal = Math.abs(efic) >= Math.abs(mix)
      ? `a maior parte veio dos próprios itens ${delta < 0 ? "piorando" : "melhorando"} (${sinal(efic)}), não de mudança de mix`
      : `a maior parte veio da distribuição do gasto entre itens (${sinal(mix)}), mais do que da performance de cada um (${sinal(efic)})`;
    const top = delta < 0 ? derrubaram[0] : puxaram[0];
    resumo = `ROAS ${dir} ${sinal(delta)} (${x1(d.anterior.roas)} → ${x1(d.atual.roas)}): ${principal}${top ? `; maior peso: ${(top.produto || `item ${top.item_id}`).slice(0, 40)} (${sinal(top.contrib)})` : ""}.`;
  }
  return { periodo: d.periodo, atual: d.atual, anterior: d.anterior, delta_roas: d.delta_roas, derrubaram, puxaram, sumiram, resumo };
}

// Bloco de texto pro Telegram (relatório semanal). Curto: até 3 que derrubaram, 2 que puxaram.
export function textoDiagnostico(dg: DiagnosticoRoas, maxDown = 3, maxUp = 2): string[] {
  const nome = (i: ItemExplicado) => (i.produto || `item ${i.item_id}`).slice(0, 40);
  const L: string[] = [];
  L.push(`🔍 Por que o ROAS mudou (${dd(dg.periodo.atual_ini)}–${dd(dg.periodo.atual_fim)} vs semana anterior):`);
  L.push(dg.resumo);
  if (dg.derrubaram.length) {
    L.push("Derrubaram:");
    dg.derrubaram.slice(0, maxDown).forEach((i) => L.push(`• ${nome(i)} (${sinal(i.contrib)}): ${i.motivo} → ${i.recomendacao}`));
  }
  if (dg.puxaram.length) {
    L.push("Puxaram pra cima:");
    dg.puxaram.slice(0, maxUp).forEach((i) => L.push(`• ${nome(i)} (${sinal(i.contrib)}): ${i.motivo} → ${i.recomendacao}`));
  }
  if (dg.sumiram.length) {
    const s = dg.sumiram[0];
    L.push(`Pararam de gastar: ${dg.sumiram.length} item(ns)${s ? ` — maior: ${nome(s)} (${brl(s.gasto_anterior)}, ROAS ${x1(s.roas_anterior)}) → ${s.recomendacao}` : ""}`);
  }
  return L;
}
