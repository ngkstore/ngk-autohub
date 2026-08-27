import { supabase } from "@/lib/supabase";
import { escopoDoUsuario, filtroLojas } from "@/lib/conta";
import AdsFiltros from "../components/AdsFiltros";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ loja?: string; per?: string }> };
type AdsLoja = {
  loja: string; gasto: number; gmv_direto: number; roas_direto: number; roas_efetivo: number;
  receita: number; tacos: number; ped_direto: number; ctr: number;
};

const brl = (v: number) => (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const n = (v: unknown) => Number(v || 0);
function diaLabel(s: string) {
  return new Date(`${s}T12:00:00-03:00`).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" });
}

export default async function AdsPage({ searchParams }: Props) {
  const params = await searchParams;
  const escopo = await escopoDoUsuario();
  const lojas = filtroLojas(escopo, params.loja);
  // Período: "30d" (últimos N dias) ou "2026-08" (mês específico). Padrão 30d.
  const per = params.per || "30d";
  let ini: string, fim: string, labelPer: string;
  const mMes = per.match(/^(\d{4})-(\d{2})$/);
  if (mMes) {
    const y = Number(mMes[1]), mo = Number(mMes[2]);
    ini = `${mMes[1]}-${mMes[2]}-01`;
    fim = new Date(Date.UTC(y, mo, 0)).toISOString().slice(0, 10); // último dia do mês
    labelPer = new Date(`${per}-01T12:00:00-03:00`).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  } else {
    const nd = Math.min(365, Math.max(1, Number((per.match(/^(\d+)d$/) || [])[1]) || 30));
    ini = new Date(Date.now() - nd * 864e5).toISOString().slice(0, 10);
    fim = new Date().toISOString().slice(0, 10);
    labelPer = `últimos ${nd} dias`;
  }

  // Lojas Shopee do escopo, pro seletor.
  const escopoLojas = filtroLojas(escopo, undefined);
  let qLojas = supabase.from("lojas").select("id, nome").eq("marketplace", "shopee").order("nome");
  if (escopoLojas) qLojas = qLojas.in("id", escopoLojas);

  let qDiario = supabase.from("ads_diario").select("dia, gasto, gmv_direto").gte("dia", ini).lte("dia", fim).order("dia");
  if (lojas) qDiario = qDiario.in("loja_id", lojas);

  const [{ data: resumoRaw }, { data: diarioRaw }, { data: lojasRaw }] = await Promise.all([
    supabase.rpc("resumo_ads", { p_loja_ids: lojas, p_ini: ini, p_fim: fim }),
    qDiario,
    qLojas,
  ]);
  const linhas = (Array.isArray(resumoRaw) ? resumoRaw : []) as AdsLoja[];
  const lojasList = (lojasRaw as { id: string; nome: string }[]) || [];
  const diario = (diarioRaw as { dia: string; gasto: number; gmv_direto: number }[]) || [];

  // Agrega por dia (soma das lojas do escopo).
  const map = new Map<string, { gasto: number; gmv: number }>();
  for (const d of diario) {
    const cur = map.get(d.dia) || { gasto: 0, gmv: 0 };
    cur.gasto += n(d.gasto);
    cur.gmv += n(d.gmv_direto);
    map.set(d.dia, cur);
  }
  const porDia = [...map.entries()].map(([dia, v]) => ({ dia, ...v })).sort((a, b) => a.dia.localeCompare(b.dia));
  const maxGasto = Math.max(1, ...porDia.map((d) => d.gasto));
  const diaPico = porDia.reduce<{ dia: string; gasto: number } | null>((mx, d) => (d.gasto > (mx?.gasto ?? -1) ? d : mx), null);

  const tot = linhas.reduce(
    (a, l) => ({ gasto: a.gasto + n(l.gasto), gmv: a.gmv + n(l.gmv_direto), receita: a.receita + n(l.receita), ped: a.ped + n(l.ped_direto) }),
    { gasto: 0, gmv: 0, receita: 0, ped: 0 }
  );
  const roasEfetivo = tot.gasto > 0 ? tot.receita / tot.gasto : 0; // faturamento REAL ÷ gasto
  const roasAtribuido = tot.gasto > 0 ? tot.gmv / tot.gasto : 0; // o que o Ads diz (atribuição Shopee)
  const tacosTot = tot.receita > 0 ? (tot.gasto / tot.receita) * 100 : 0;
  const margemContrib = 0.13; // margem de contribuição média (~13%, do Balanço)
  const roasEquilibrio = 1 / margemContrib; // ≈ 7,7× — abaixo disso, o anúncio dá prejuízo

  const meses = Array.from({ length: 6 }, (_, i) => {
    const h = new Date();
    const d = new Date(h.getFullYear(), h.getMonth() - i, 1);
    const v = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    return { v, l: d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" }) };
  });

  const Kpi = ({ label, val, hint, cor }: { label: string; val: string; hint?: string; cor?: string }) => (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
      <p className="text-sm text-slate-400">{label}</p>
      <p className={`mt-2 text-2xl font-bold ${cor || "text-white"}`}>{val}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );

  return (
    <div className="p-8 text-white">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-4xl font-bold">📊 Ads</h1>
          <p className="mt-2 max-w-xl text-slate-400">
            Gasto, retorno e tendência dos anúncios (nível loja, direto da API da Shopee). A análise por anúncio fica no <b>Raio-X</b>.
          </p>
        </div>
        <AdsFiltros lojas={lojasList} lojaAtual={params.loja || "todas"} per={per} meses={meses} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Gasto em Ads" val={brl(tot.gasto)} hint={labelPer} cor="text-orange-300" />
        <Kpi label="ROAS efetivo" val={`${roasEfetivo.toFixed(1)}×`} hint={`faturamento real ÷ gasto · equilíbrio ≈ ${roasEquilibrio.toFixed(1)}×`} cor="text-emerald-300" />
        <Kpi label="TACOS" val={`${tacosTot.toFixed(1)}%`} hint="gasto ÷ faturamento real" cor="text-blue-300" />
        <Kpi label="Faturamento (real)" val={brl(tot.receita)} hint={`ROAS atribuído do Ads: ${roasAtribuido.toFixed(1)}×`} cor="text-violet-300" />
      </div>

      {porDia.length > 0 && (
        <div className="mt-8 rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <div className="mb-1 flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="text-xl font-bold">Gasto por dia · {labelPer}</h2>
            {diaPico && (
              <span className="text-sm text-slate-400">
                dia campeão: <b className="text-orange-300">{diaLabel(diaPico.dia)}</b> · {brl(diaPico.gasto)}
              </span>
            )}
          </div>
          <p className="mb-5 text-xs text-slate-500">Quanto entrou de gasto de anúncio em cada dia — pra ver picos e a evolução.</p>
          <div className="space-y-1.5">
            {porDia.map((d) => (
              <div key={d.dia} className="flex items-center gap-3">
                <span className="w-24 shrink-0 text-xs text-slate-400">{diaLabel(d.dia)}</span>
                <div className="h-5 flex-1 overflow-hidden rounded-md bg-slate-800">
                  <div
                    className={`h-full rounded-md ${diaPico && d.dia === diaPico.dia ? "bg-orange-500" : "bg-orange-500/60"}`}
                    style={{ width: `${Math.max(2, (d.gasto / maxGasto) * 100)}%` }}
                  />
                </div>
                <span className="w-24 shrink-0 text-right text-xs tabular-nums text-slate-300">{brl(d.gasto)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-6 overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-800 text-xs uppercase text-slate-400">
            <tr>
              <th className="p-3">Loja</th>
              <th className="p-3 text-right">Gasto</th>
              <th className="p-3 text-right">Faturamento</th>
              <th className="p-3 text-right">ROAS efet.</th>
              <th className="p-3 text-right">TACOS</th>
              <th className="p-3 text-right">CTR</th>
              <th className="p-3 text-right">Pedidos</th>
            </tr>
          </thead>
          <tbody>
            {linhas.length === 0 ? (
              <tr><td className="p-4 text-slate-400" colSpan={7}>Sem dados de Ads ainda — sincroniza em alguns minutos.</td></tr>
            ) : linhas.map((l) => (
              <tr key={l.loja} className="border-t border-slate-800">
                <td className="p-3">{l.loja}</td>
                <td className="p-3 text-right">{brl(n(l.gasto))}</td>
                <td className="p-3 text-right">{brl(n(l.receita))}</td>
                <td className="p-3 text-right text-emerald-300">{n(l.roas_efetivo).toFixed(1)}×</td>
                <td className={`p-3 text-right ${n(l.tacos) > 15 ? "text-red-300" : n(l.tacos) > 8 ? "text-orange-300" : "text-emerald-300"}`}>
                  {n(l.tacos).toFixed(1)}%
                </td>
                <td className="p-3 text-right">{n(l.ctr).toFixed(2)}%</td>
                <td className="p-3 text-right">{n(l.ped_direto)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-xs text-slate-500">
        <b>ROAS efetivo</b> = faturamento REAL (pedidos pagos) ÷ gasto — usa seu número de verdade, não a atribuição do Ads
        (que costuma inflar; aqui o GMV atribuído chegou a passar o faturamento total). <b>TACOS</b> = gasto ÷ faturamento real.
        <b> Equilíbrio</b> ≈ {roasEquilibrio.toFixed(1)}× (margem de contribuição ~{(margemContrib * 100).toFixed(0)}%): abaixo
        disso o gasto come toda a margem. Obs: o ROAS efetivo é &quot;blended&quot; (inclui venda orgânica). Análise por anúncio fica no <b>Raio-X</b>.
      </p>
    </div>
  );
}
