import { supabase } from "@/lib/supabase";
import { escopoDoUsuario, filtroLojas } from "@/lib/conta";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ loja?: string }> };
type Rec = {
  item_id: number; campaign_id: number | null; gasto_7d: number; roas_shopee: number;
  fator: number; roas_real: number; roas_minimo: number | null; meta_roas: number | null;
  classificacao: string; acao: string; loja_id: string;
};

const brl = (v: number) => (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const n = (v: unknown) => Number(v || 0);

const COR: Record<string, string> = {
  campeao: "text-emerald-300", abaixo_do_minimo: "text-red-300", meta_desalinhada: "text-orange-300",
  aprendizado: "text-blue-300", sem_margem: "text-slate-400", saudavel: "text-slate-300",
};
const ROTULO: Record<string, string> = {
  campeao: "Campeão", abaixo_do_minimo: "Abaixo do mínimo", meta_desalinhada: "Meta desalinhada",
  aprendizado: "Aprendizado", sem_margem: "Sem custo", saudavel: "Saudável",
};

export default async function AdsControlePage({ searchParams }: Props) {
  const params = await searchParams;
  const escopo = await escopoDoUsuario();
  const lojas = filtroLojas(escopo, params.loja);
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

  let qRec = supabase.from("ads_recomendacoes").select("*").eq("dia", hoje).order("gasto_7d", { ascending: false }).limit(300);
  if (lojas) qRec = qRec.in("loja_id", lojas);

  const [{ data: resumoRaw }, { data: recsRaw }] = await Promise.all([
    supabase.rpc("ads_resumo_controle", { p_loja_ids: lojas }),
    qRec,
  ]);
  const r = (resumoRaw as Record<string, unknown>) || {};
  const recs = (recsRaw as Rec[]) || [];

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

  const alertas: string[] = [];
  if (saldoDias > 0 && saldoDias < 7) alertas.push(`Saldo de créditos baixo: cobre só ~${saldoDias} dia(s) de gasto (${brl(n(r.saldo))}).`);
  const nRisco = porClasse.find((c) => c.classificacao === "abaixo_do_minimo");
  if (nRisco) alertas.push(`${nRisco.qtd} item(ns) abaixo do ROAS mínimo — ${brl(nRisco.gasto)} em gasto no prejuízo.`);

  const Kpi = ({ label, val, hint, cor, trend }: { label: string; val: string; hint?: string; cor?: string; trend?: number | null }) => (
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

  return (
    <div className="p-8 text-white">
      <h1 className="text-4xl font-bold">🎯 Controle de Ads (GMV Max)</h1>
      <p className="mt-2 max-w-2xl text-slate-400">
        ROAS <b>real</b> por item (corrigido pelo fator de efetivação) contra o ROAS <b>mínimo</b> (margem da conciliação) e a sua meta.
        Atualiza todo dia de madrugada. Ações prioritárias por gasto em risco.
      </p>

      {alertas.length > 0 && (
        <div className="mt-6 space-y-2">
          {alertas.map((a, i) => (
            <div key={i} className="rounded-xl border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-200">🚨 {a}</div>
          ))}
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Kpi label="ROAS real (semana)" val={`${roasSemana.toFixed(1)}×`} trend={tend} hint={`média 4 semanas: ${n(r.roas_media4s).toFixed(1)}×`} cor="text-emerald-300" />
        <Kpi label="Gasto (semana)" val={brl(n(r.gasto_semana))} hint={`~${brl(n(r.gasto_medio_dia))}/dia`} cor="text-orange-300" />
        <Kpi label="Gasto em risco" val={brl(n(r.gasto_risco))} hint="itens abaixo do mínimo" cor="text-red-300" />
        <Kpi label="Saldo de créditos" val={brl(n(r.saldo))} hint={`~${saldoDias} dia(s) de gasto`} cor={saldoDias < 7 ? "text-red-300" : "text-emerald-300"} />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {porClasse.map((c) => (
          <span key={c.classificacao} className={`rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-xs ${COR[c.classificacao] || "text-slate-300"}`}>
            {ROTULO[c.classificacao] || c.classificacao}: <b>{c.qtd}</b> · {brl(c.gasto)}
          </span>
        ))}
      </div>

      <div className="mt-6 overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-800 text-xs uppercase text-slate-400">
            <tr>
              <th className="p-3">Produto</th>
              <th className="p-3 text-right">Gasto 7d</th>
              <th className="p-3 text-right">ROAS real</th>
              <th className="p-3 text-right">ROAS mín.</th>
              <th className="p-3 text-right">Meta</th>
              <th className="p-3">Situação</th>
              <th className="p-3">Ação</th>
            </tr>
          </thead>
          <tbody>
            {recs.length === 0 ? (
              <tr><td className="p-4 text-slate-400" colSpan={7}>Sem recomendações ainda — o coletor roda de madrugada. Rode o backfill se acabou de configurar.</td></tr>
            ) : recs.map((x) => (
              <tr key={`${x.loja_id}-${x.item_id}`} className="border-t border-slate-800">
                <td className="p-3 max-w-xs truncate" title={nomes[String(x.item_id)] || String(x.item_id)}>
                  {nomes[String(x.item_id)] || <span className="text-slate-500">item {x.item_id}</span>}
                </td>
                <td className="p-3 text-right tabular-nums">{brl(n(x.gasto_7d))}</td>
                <td className="p-3 text-right tabular-nums">{n(x.roas_real).toFixed(1)}×</td>
                <td className="p-3 text-right tabular-nums text-slate-400">{x.roas_minimo != null ? `${n(x.roas_minimo).toFixed(1)}×` : "—"}</td>
                <td className="p-3 text-right tabular-nums text-slate-400">{x.meta_roas != null ? `${n(x.meta_roas).toFixed(1)}×` : "—"}</td>
                <td className={`p-3 font-semibold ${COR[x.classificacao] || "text-slate-300"}`}>{ROTULO[x.classificacao] || x.classificacao}</td>
                <td className="p-3 text-xs text-slate-400">{x.acao}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-xs text-slate-500">
        <b>ROAS real</b> = ROAS Shopee × fator de efetivação (corrige cancelamentos/devoluções). <b>ROAS mínimo</b> = 1 ÷ margem efetiva
        (taxa real do escrow + custo + 6%): abaixo disso o anúncio dá prejuízo. Itens <b>sem custo</b> cadastrado não têm mínimo confiável.
      </p>
    </div>
  );
}
