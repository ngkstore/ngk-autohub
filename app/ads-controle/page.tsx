import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { escopoDoUsuario, filtroLojas } from "@/lib/conta";
import LojaSeletor from "../components/LojaSeletor";
import AjusteInline from "../components/AjusteInline";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ loja?: string }> };
type Rec = {
  item_id: number; campaign_id: number | null; gasto_7d: number; roas_shopee: number;
  fator: number; roas_real: number; roas_minimo: number | null; meta_roas: number | null;
  classificacao: string; acao: string; loja_id: string;
  orcamento_configurado: number | null; orcamento_ideal: number | null; censurado_teto: boolean;
  estado_janela: string | null; dias_restantes_janela: number | null; motivo_supressao: string | null;
  meta_calculada: number | null; degrau_avaliacao: Record<string, unknown> | null;
};
// Próximo degrau da meta: 15% da meta atual na direção da meta calculada (nunca passa dela).
// Só é oferecido quando o motor recomenda mexer na meta (campeão = manter meta).
function proximoDegrau(x: Rec): number | null {
  if (!["pronto_proximo_degrau", "meta_desalinhada"].includes(x.classificacao)) return null;
  const meta = x.meta_roas != null ? Number(x.meta_roas) : null;
  const calc = x.meta_calculada != null ? Number(x.meta_calculada) : null;
  if (meta == null || calc == null || Math.abs(calc - meta) <= 0.15 * calc) return null;
  return Math.round((meta + Math.sign(calc - meta) * Math.min(Math.abs(calc - meta), 0.15 * meta)) * 10) / 10;
}

const brl = (v: number) => (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const n = (v: unknown) => Number(v || 0);

const COR: Record<string, string> = {
  campeao: "text-emerald-300", abaixo_do_minimo: "text-red-300", meta_desalinhada: "text-orange-300",
  aprendizado: "text-blue-300", sem_margem: "text-slate-400", saudavel: "text-slate-300",
  problema_anuncio: "text-orange-300", problema_pagina: "text-orange-300", meta_nao_entregue: "text-orange-300",
  orcamento_esgotando: "text-amber-300", estabilizacao: "text-blue-300", pronto_proximo_degrau: "text-emerald-300",
  retomar_meta: "text-red-300",
};
const ROTULO: Record<string, string> = {
  campeao: "Campeão", abaixo_do_minimo: "Abaixo do mínimo", meta_desalinhada: "Meta desalinhada",
  aprendizado: "Aprendizado", sem_margem: "Sem custo", saudavel: "Saudável",
  problema_anuncio: "Problema no anúncio", problema_pagina: "Problema na página", meta_nao_entregue: "Meta não entregue",
  orcamento_esgotando: "Orçamento esgotando", estabilizacao: "Estabilização", pronto_proximo_degrau: "Pronto p/ próximo degrau",
  retomar_meta: "Retomar meta anterior",
};
const JANELA: Record<string, string> = { aprendizado: "🎓 aprendizado", estabilizacao: "⏳ estabilização", livre: "✓ livre" };

function Kpi({ label, val, hint, cor, trend }: { label: string; val: string; hint?: string; cor?: string; trend?: number | null }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
      <p className="text-sm text-slate-400">{label}</p>
      <p className={`mt-2 text-2xl font-bold ${cor || "text-white"}`}>{val}</p>
      {trend != null && (
        <p className={`mt-1 text-xs ${trend >= 0 ? "text-emerald-400" : "text-red-400"}`}>
          {trend >= 0 ? "▲" : "▼"} {Math.abs(trend).toFixed(0)}% vs semana anterior
        </p>
      )}
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

export default async function AdsControlePage({ searchParams }: Props) {
  const params = await searchParams;
  const escopo = await escopoDoUsuario();
  const lojas = filtroLojas(escopo, params.loja);
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

  // Lojas Shopee da conta, pro seletor e pra coluna "Loja".
  const escopoLojas = filtroLojas(escopo, undefined);
  let qLojas = supabase.from("lojas").select("id, nome, nome_publico, apelido").eq("marketplace", "shopee").order("nome");
  if (escopoLojas) qLojas = qLojas.in("id", escopoLojas);

  let qRec = supabase.from("ads_recomendacoes").select("*").eq("dia", hoje).order("gasto_7d", { ascending: false }).limit(300);
  if (lojas) qRec = qRec.in("loja_id", lojas);

  let qRef = supabase.from("ads_reforcos").select("loja_id, campaign_id, orcamento_base").eq("dia", hoje).is("revertido_em", null);
  if (lojas) qRef = qRef.in("loja_id", lojas);

  const [{ data: resumoRaw }, { data: recsRaw }, { data: lojasRaw }, { data: refRaw }] = await Promise.all([
    supabase.rpc("ads_resumo_controle", { p_loja_ids: lojas }),
    qRec,
    qLojas,
    qRef,
  ]);
  // Reforço automático ativo hoje, por campanha (mostra ⚡ e a base na edição inline).
  const reforcoBase: Record<string, number> = Object.fromEntries(
    (((refRaw as { loja_id: string; campaign_id: number; orcamento_base: number }[]) || []).map((f) => [`${f.loja_id}-${f.campaign_id}`, Number(f.orcamento_base)]))
  );
  const r = (resumoRaw as Record<string, unknown>) || {};
  const recs = (recsRaw as Rec[]) || [];
  const lojasList = ((lojasRaw as { id: string; nome: string; nome_publico: string | null; apelido: string | null }[]) || [])
    .map((l) => ({ id: l.id, nome: l.nome_publico || l.apelido || l.nome }));
  const nomeLoja: Record<string, string> = Object.fromEntries(lojasList.map((l) => [l.id, l.nome]));
  const mostrarLoja = !params.loja && lojasList.length > 1;

  // Nomes dos produtos (item_id -> nome).
  const nomes: Record<string, string> = {};
  const ids = [...new Set(recs.map((x) => String(x.item_id)))];
  if (ids.length) {
    let pq = supabase.from("produtos").select("item_id, nome").in("item_id", ids);
    if (lojas) pq = pq.in("loja_id", lojas);
    const { data } = await pq;
    (data as { item_id: string; nome: string }[] | null)?.forEach((p) => (nomes[p.item_id] = p.nome));
  }

  const saldoDias = n(r.saldo_dias);
  const roasSemana = n(r.roas_semana);
  const roasAnterior = n(r.roas_anterior);
  const tend = roasAnterior > 0 ? ((roasSemana - roasAnterior) / roasAnterior) * 100 : null;
  const porClasse = (r.por_classificacao as { classificacao: string; qtd: number; gasto: number }[]) || [];

  const comOrc = recs.filter((x) => x.orcamento_ideal != null && x.orcamento_configurado != null);
  const orcCfg = comOrc.reduce((s, x) => s + n(x.orcamento_configurado), 0);
  const orcIdeal = comOrc.reduce((s, x) => s + n(x.orcamento_ideal), 0);
  const noTeto = recs.filter((x) => x.censurado_teto).length;
  const emJanela = recs.filter((x) => x.estado_janela && x.estado_janela !== "livre").length;

  const alertas: string[] = [];
  if (saldoDias > 0 && saldoDias < 7) alertas.push(`Saldo de créditos baixo: cobre só ~${saldoDias.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} dia(s) de gasto (${brl(n(r.saldo))}).`);
  const nRisco = porClasse.find((c) => c.classificacao === "abaixo_do_minimo");
  if (nRisco) alertas.push(`${nRisco.qtd} item(ns) abaixo do ROAS mínimo — ${brl(nRisco.gasto)} em gasto no prejuízo.`);
  const nEsg = porClasse.find((c) => c.classificacao === "orcamento_esgotando");
  if (nEsg) alertas.push(`${nEsg.qtd} item(ns) com ROAS saudável batendo no teto do orçamento — vale subir 20-30%.`);
  const nRet = porClasse.find((c) => c.classificacao === "retomar_meta");
  if (nRet) alertas.push(`${nRet.qtd} item(ns) perderam volume e lucro depois de subir a meta — vale voltar à meta anterior (abra o item).`);

  return (
    <div className="p-8 text-white">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-4xl font-bold">🎯 Controle de Ads (GMV Max)</h1>
          <p className="mt-2 max-w-2xl text-slate-400">
            ROAS <b>real</b> por item (corrigido pelo fator de efetivação) contra o ROAS <b>mínimo</b> (margem da conciliação) e a sua meta.
            Clique no produto pra abrir o painel completo (conversão, CTR, custo por venda, GMV real) e ajustar orçamento/meta.
          </p>
        </div>
        <LojaSeletor lojas={lojasList} atual={params.loja || "todas"} base="/ads-controle" />
      </div>

      {alertas.length > 0 && (
        <div className="mt-6 space-y-2">
          {alertas.map((a, i) => (
            <div key={i} className="rounded-xl border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-200">🚨 {a}</div>
          ))}
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
        <Kpi label="ROAS real (semana)" val={`${roasSemana.toFixed(1)}×`} trend={tend} hint={`média 4 semanas: ${n(r.roas_media4s).toFixed(1)}×`} cor="text-emerald-300" />
        <Kpi label="Gasto (semana)" val={brl(n(r.gasto_semana))} hint={`~${brl(n(r.gasto_medio_dia))}/dia`} cor="text-orange-300" />
        <Kpi label="Gasto em risco" val={brl(n(r.gasto_risco))} hint="itens abaixo do mínimo" cor="text-red-300" />
        <Kpi label="Orçamento/dia ideal" val={comOrc.length ? brl(orcIdeal) : "—"} hint={comOrc.length ? `configurado ${brl(orcCfg)}${noTeto ? ` · ${noTeto} no teto` : ""}` : "sem base ainda"} cor="text-amber-300" />
        <Kpi label="Saldo de créditos" val={brl(n(r.saldo))} hint={`~${saldoDias.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} dia(s) de gasto`} cor={saldoDias < 7 ? "text-red-300" : "text-emerald-300"} />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {porClasse.map((c) => (
          <span key={c.classificacao} className={`rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-xs ${COR[c.classificacao] || "text-slate-300"}`}>
            {ROTULO[c.classificacao] || c.classificacao}: <b>{c.qtd}</b> · {brl(c.gasto)}
          </span>
        ))}
        {emJanela > 0 && (
          <span className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-xs text-blue-300">🕐 em janela: <b>{emJanela}</b></span>
        )}
      </div>

      <div className="mt-6 overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-800 text-xs uppercase text-slate-400">
            <tr>
              <th className="p-3">Produto</th>
              {mostrarLoja && <th className="p-3">Loja</th>}
              <th className="p-3 text-right">Gasto 7d</th>
              <th className="p-3 text-right">ROAS real</th>
              <th className="p-3 text-right">ROAS mín.</th>
              <th className="p-3 text-right">Meta</th>
              <th className="p-3 text-right">Orç. config → ideal <span className="normal-case text-slate-500">(✎ edita aqui)</span></th>
              <th className="p-3">Janela</th>
              <th className="p-3">Situação</th>
              <th className="p-3">Ação</th>
            </tr>
          </thead>
          <tbody>
            {recs.length === 0 ? (
              <tr><td className="p-4 text-slate-400" colSpan={mostrarLoja ? 10 : 9}>Sem recomendações ainda — o coletor roda de madrugada. Rode o backfill se acabou de configurar.</td></tr>
            ) : recs.map((x) => (
              <tr key={`${x.loja_id}-${x.item_id}`} className="border-t border-slate-800 hover:bg-slate-800/40">
                <td className="p-3 max-w-xs truncate" title={nomes[String(x.item_id)] || String(x.item_id)}>
                  <Link href={`/ads-controle/item?loja=${x.loja_id}&item=${x.item_id}`} className="text-white underline decoration-slate-600 underline-offset-2 hover:decoration-emerald-400">
                    {nomes[String(x.item_id)] || <span className="text-slate-500">item {x.item_id}</span>}
                  </Link>
                </td>
                {mostrarLoja && <td className="p-3 text-xs text-slate-400">{nomeLoja[x.loja_id] || "—"}</td>}
                <td className="p-3 text-right tabular-nums">{brl(n(x.gasto_7d))}</td>
                <td className="p-3 text-right tabular-nums">{n(x.roas_real).toFixed(1)}×</td>
                <td className="p-3 text-right tabular-nums text-slate-400">{x.roas_minimo != null ? `${n(x.roas_minimo).toFixed(1)}×` : "—"}</td>
                <AjusteInline
                  lojaId={x.loja_id}
                  campaignId={x.campaign_id}
                  itemId={x.item_id}
                  metaAtual={x.meta_roas != null ? n(x.meta_roas) : null}
                  orcamentoAtual={x.orcamento_configurado != null ? n(x.orcamento_configurado) : null}
                  orcamentoIdeal={x.orcamento_ideal != null ? n(x.orcamento_ideal) : null}
                  metaSugerida={proximoDegrau(x)}
                  metaAnterior={x.classificacao === "retomar_meta" && x.degrau_avaliacao?.meta_antes != null ? n(x.degrau_avaliacao.meta_antes) : null}
                  janela={x.estado_janela}
                  diasRestantes={x.dias_restantes_janela}
                  censurado={!!x.censurado_teto}
                  reforcoBase={x.campaign_id != null ? reforcoBase[`${x.loja_id}-${x.campaign_id}`] ?? null : null}
                />
                <td className="p-3 text-xs" title={x.motivo_supressao || undefined}>
                  <span className={x.estado_janela === "livre" ? "text-slate-500" : "text-blue-300"}>{JANELA[x.estado_janela || "livre"] || x.estado_janela}</span>
                  {x.estado_janela && x.estado_janela !== "livre" && <span className="text-slate-400"> · faltam {x.dias_restantes_janela ?? 0}d</span>}
                </td>
                <td className={`p-3 font-semibold ${COR[x.classificacao] || "text-slate-300"}`}>{ROTULO[x.classificacao] || x.classificacao}</td>
                <td className="p-3 text-xs text-slate-400">{x.acao}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-xs text-slate-500">
        <b>ROAS real</b> = ROAS Shopee × fator de efetivação. <b>ROAS mínimo</b> = 1 ÷ margem efetiva (taxa real do escrow + custo + 6%).
        <b> Meta desalinhada</b> = sua meta ROAS na Shopee difere mais de 15% da meta calculada (máx. entre 30× e o ROAS mínimo, ÷ fator) — ajuste em degraus de ~15%.
        <b> Orçamento ideal</b> = 2,5× o gasto médio &quot;normal&quot; (28 dias, sem promoção e sem dia de campanha Shopee) para campeão/saudável; 1,25× em aprendizado/estabilização/problemas; 0 abaixo do mínimo.
        Ideal &lt; configurado = folga (orçamento não é o limitador); item batendo no teto (≥95% em ≥5 de 7 dias) com ROAS saudável sobe em degrau de +25%.
        <b> Janela</b>: aprendizado = 14 dias após o início; estabilização = 12 dias após alterar a meta — nesses períodos a recomendação de mexer na meta é suprimida.
      </p>
    </div>
  );
}
