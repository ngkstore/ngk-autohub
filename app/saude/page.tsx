import { supabase } from "@/lib/supabase";
import { escopoDoUsuario, filtroLojas } from "@/lib/conta";
import LojaSeletor from "../components/LojaSeletor";
import { RATING, TIPO_METRICA, METRICA_PT, MOTIVO_ANUNCIO, PUNICAO_PT, violacaoPt, fmtValor, fmtMeta } from "@/lib/shopee/saudeConta";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ loja?: string }> };
type Snap = {
  loja_id: string; dia: string; rating: number | null; falhas_envio: number | null; falhas_anuncio: number | null;
  falhas_atendimento: number | null; metricas_fora: number | null; pedidos_atrasados: number | null; anuncios_problema: number | null;
  pontos_penalidade: number | null; punicoes_ativas: number | null; coletado_em: string;
};
type Met = {
  loja_id: string; dia: string; metric_id: number; metric_type: number | null; parent_metric_id: number | null; nome: string | null;
  atual: number | null; anterior: number | null; unidade: number | null; alvo: number | null; comparador: string | null;
  isencao_ate: string | null; fora_da_meta: boolean | null;
};
type Pen = { loja_id: string; issue_time: string; violation_type: number; pontos_original: number | null; pontos_atual: number | null };
type Pun = { loja_id: string; punishment_type: number; start_time: string; end_time: string | null; reason: number | null; order_limit: string | null; listing_limit: number[] | null; status: number };
type Late = { loja_id: string; dia: string; order_sn: string; shipping_deadline: string | null; late_by_days: number | null };
type Iss = { loja_id: string; dia: string; item_id: number; reason: number | null };

const COR_RATING: Record<number, string> = {
  1: "bg-red-900/60 text-red-200 border-red-800", 2: "bg-orange-900/60 text-orange-200 border-orange-800",
  3: "bg-emerald-900/50 text-emerald-200 border-emerald-800", 4: "bg-emerald-800/60 text-emerald-100 border-emerald-700",
};
const dt = (s: string | null) => (s ? new Date(s).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—");
const dth = (s: string | null) =>
  s ? new Date(s).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";
const diaLocal = (s: string) => new Date(`${s}T12:00:00`).toLocaleDateString("pt-BR");

export default async function SaudePage({ searchParams }: Props) {
  const params = await searchParams;
  const escopo = await escopoDoUsuario();
  const lojas = filtroLojas(escopo, params.loja);
  const escopoLojas = filtroLojas(escopo, undefined);

  let qLojas = supabase.from("lojas").select("id, nome, nome_publico, apelido").eq("marketplace", "shopee").order("nome");
  if (escopoLojas) qLojas = qLojas.in("id", escopoLojas);
  let qSnap = supabase.from("saude_conta_snapshot").select("*").order("dia", { ascending: false }).limit(200);
  if (lojas) qSnap = qSnap.in("loja_id", lojas);
  const [{ data: lojasRaw }, { data: snapsRaw }] = await Promise.all([qLojas, qSnap]);
  const lojasList = ((lojasRaw as { id: string; nome: string; nome_publico: string | null; apelido: string | null }[]) || [])
    .map((l) => ({ id: l.id, nome: l.nome_publico || l.apelido || l.nome }));
  const nomeLoja: Record<string, string> = Object.fromEntries(lojasList.map((l) => [l.id, l.nome]));

  // Último snapshot por loja (só lojas do escopo).
  const ultimo: Record<string, Snap> = {};
  for (const s of (snapsRaw as Snap[]) || []) {
    if (!ultimo[s.loja_id] && nomeLoja[s.loja_id]) ultimo[s.loja_id] = s;
  }
  const ids = Object.keys(ultimo);

  const corte90 = new Date(Date.now() - 90 * 864e5).toISOString();
  const vazio = { data: [] as unknown[] };
  const [{ data: metsRaw }, { data: pensRaw }, { data: punsRaw }, { data: latesRaw }, { data: issRaw }] = ids.length
    ? await Promise.all([
        supabase.from("saude_metricas").select("*").in("loja_id", ids).order("metric_type").order("metric_id"),
        supabase.from("saude_penalidades").select("*").in("loja_id", ids).gte("issue_time", corte90).order("issue_time", { ascending: false }),
        supabase.from("saude_punicoes").select("*").in("loja_id", ids).order("start_time", { ascending: false }).limit(100),
        supabase.from("saude_pedidos_atrasados").select("*").in("loja_id", ids).order("late_by_days", { ascending: false }),
        supabase.from("saude_anuncios_problema").select("*").in("loja_id", ids),
      ])
    : [vazio, vazio, vazio, vazio, vazio];
  const mets = ((metsRaw as Met[]) || []).filter((m) => ultimo[m.loja_id]?.dia === m.dia);
  const pens = (pensRaw as Pen[]) || [];
  const puns = (punsRaw as Pun[]) || [];
  const lates = ((latesRaw as Late[]) || []).filter((x) => ultimo[x.loja_id]?.dia === x.dia);
  const iss = ((issRaw as Iss[]) || []).filter((x) => ultimo[x.loja_id]?.dia === x.dia);

  // Nome dos produtos com problema.
  const nomes: Record<string, string> = {};
  const itemIds = [...new Set(iss.map((i) => String(i.item_id)))];
  if (itemIds.length) {
    const { data } = await supabase.from("produtos").select("item_id, nome").in("item_id", itemIds);
    (data as { item_id: string; nome: string }[] | null)?.forEach((p) => (nomes[String(p.item_id)] = p.nome));
  }

  return (
    <div className="p-8 text-white">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-4xl font-bold">🩺 Saúde da conta</h1>
          <p className="mt-2 max-w-2xl text-slate-400">
            Métricas que a Shopee usa pra punir ou premiar a loja (envio, anúncios, atendimento), pontos de penalidade,
            punições em vigor, pedidos atrasados e anúncios com problema. Coleta diária de manhã; alertas vão pro Telegram.
          </p>
        </div>
        <LojaSeletor lojas={lojasList} atual={params.loja || "todas"} base="/saude" />
      </div>

      {ids.length === 0 && (
        <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-900 p-5 text-slate-400">
          Sem coleta ainda — o coletor roda todo dia de manhã. Se acabou de configurar, chame /api/shopee/saude/coletar.
        </div>
      )}

      {ids.map((id) => {
        const s = ultimo[id];
        const m = mets.filter((x) => x.loja_id === id);
        const pAtivas = puns.filter((x) => x.loja_id === id && x.status === 1);
        const pen = pens.filter((x) => x.loja_id === id);
        const lt = lates.filter((x) => x.loja_id === id);
        const is = iss.filter((x) => x.loja_id === id);
        const tipos = [1, 2, 3].filter((t) => m.some((x) => x.metric_type === t));
        const cards: [string, string | number | null, string][] = [
          ["Métricas fora da meta", s.metricas_fora, (s.metricas_fora || 0) > 0 ? "text-red-300" : "text-emerald-300"],
          ["Punições em vigor", s.punicoes_ativas, (s.punicoes_ativas || 0) > 0 ? "text-red-300" : "text-emerald-300"],
          ["Pontos (90 dias)", s.pontos_penalidade, (s.pontos_penalidade || 0) > 0 ? "text-orange-300" : "text-emerald-300"],
          ["Pedidos atrasados", s.pedidos_atrasados, (s.pedidos_atrasados || 0) > 0 ? "text-orange-300" : "text-emerald-300"],
          ["Anúncios c/ problema", s.anuncios_problema, (s.anuncios_problema || 0) > 0 ? "text-orange-300" : "text-emerald-300"],
          ["Falhas envio / anúncio / atend.", `${s.falhas_envio ?? 0} / ${s.falhas_anuncio ?? 0} / ${s.falhas_atendimento ?? 0}`, "text-slate-200"],
        ];
        return (
          <section key={id} className="mt-8 rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <h2 className="text-2xl font-bold">{nomeLoja[id]}</h2>
                <span className={`rounded-full border px-3 py-1 text-sm font-semibold ${s.rating != null ? COR_RATING[s.rating] || "border-slate-700" : "border-slate-700 text-slate-400"}`}>
                  {s.rating != null ? RATING[s.rating] || s.rating : "sem nota"}
                </span>
              </div>
              <p className="text-xs text-slate-500">coletado {dth(s.coletado_em)} · dia {diaLocal(s.dia)}</p>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              {cards.map(([l, v, c]) => (
                <div key={l} className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                  <p className="text-xs text-slate-400">{l}</p>
                  <p className={`mt-1 text-xl font-bold ${c}`}>{v ?? "—"}</p>
                </div>
              ))}
            </div>

            {pAtivas.length > 0 && (
              <div className="mt-4 space-y-2">
                {pAtivas.map((p, i) => (
                  <div key={i} className="rounded-xl border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-200">
                    ⛔ Punição em vigor: <b>{PUNICAO_PT[p.punishment_type] || `tipo ${p.punishment_type}`}</b> desde {dt(p.start_time)}
                    {p.end_time ? ` até ${dt(p.end_time)}` : ""}
                    {p.order_limit ? ` · limite de pedidos ${p.order_limit}%` : ""}
                    {p.listing_limit?.length ? ` · limite de anúncios ${p.listing_limit.join("/")}` : ""}
                  </div>
                ))}
              </div>
            )}

            <div className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-3">
              {tipos.map((t) => (
                <div key={t} className="overflow-x-auto rounded-xl border border-slate-800">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-800 text-xs uppercase text-slate-400">
                      <tr>
                        <th className="p-2">{TIPO_METRICA[t]}</th>
                        <th className="p-2 text-right">Atual</th>
                        <th className="p-2 text-right">Meta</th>
                        <th className="p-2 text-right">Anterior</th>
                      </tr>
                    </thead>
                    <tbody>
                      {m.filter((x) => x.metric_type === t).map((x) => (
                        <tr key={x.metric_id} className={`border-t border-slate-800 ${x.fora_da_meta ? "bg-red-950/30" : ""}`}>
                          <td className="p-2">
                            <span className={x.parent_metric_id && x.parent_metric_id > 0 ? "pl-3 text-slate-400" : "text-slate-200"}>
                              {x.fora_da_meta ? "❌ " : x.fora_da_meta === false ? "✅ " : ""}
                              {METRICA_PT[x.metric_id] || x.nome || x.metric_id}
                            </span>
                            {x.isencao_ate && <span className="ml-1 text-[10px] text-blue-300">(isento até {x.isencao_ate})</span>}
                          </td>
                          <td className={`p-2 text-right font-semibold ${x.fora_da_meta ? "text-red-300" : "text-white"}`}>{fmtValor(x.atual, x.unidade)}</td>
                          <td className="p-2 text-right text-slate-400">{fmtMeta(x.alvo, x.comparador, x.unidade)}</td>
                          <td className="p-2 text-right text-slate-500">{fmtValor(x.anterior, x.unidade)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>

            <div className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-3">
              <div className="rounded-xl border border-slate-800 p-3">
                <p className="text-xs font-semibold uppercase text-slate-400">Pontos de penalidade (90 dias)</p>
                {pen.length === 0 ? (
                  <p className="mt-2 text-sm text-emerald-300">Nenhum ponto no período.</p>
                ) : (
                  <ul className="mt-2 space-y-1 text-sm">
                    {pen.slice(0, 15).map((p, i) => (
                      <li key={i} className="text-slate-300">
                        <span className="text-orange-300">{p.pontos_atual ?? p.pontos_original ?? "?"} pt</span> · {violacaoPt(p.violation_type)} ·{" "}
                        <span className="text-slate-500">{dt(p.issue_time)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="rounded-xl border border-slate-800 p-3">
                <p className="text-xs font-semibold uppercase text-slate-400">Pedidos com envio atrasado</p>
                {lt.length === 0 ? (
                  <p className="mt-2 text-sm text-emerald-300">Nenhum pedido atrasado.</p>
                ) : (
                  <ul className="mt-2 space-y-1 text-sm">
                    {lt.slice(0, 20).map((o) => (
                      <li key={o.order_sn} className="text-slate-300">
                        <span className="font-mono">{o.order_sn}</span> · prazo {dt(o.shipping_deadline)} ·{" "}
                        <span className="text-red-300">{o.late_by_days ?? "?"} dia(s)</span>
                      </li>
                    ))}
                    {lt.length > 20 && <li className="text-slate-500">… e mais {lt.length - 20}</li>}
                  </ul>
                )}
              </div>
              <div className="rounded-xl border border-slate-800 p-3">
                <p className="text-xs font-semibold uppercase text-slate-400">Anúncios com problema</p>
                {is.length === 0 ? (
                  <p className="mt-2 text-sm text-emerald-300">Nenhum anúncio apontado.</p>
                ) : (
                  <ul className="mt-2 space-y-1 text-sm">
                    {is.slice(0, 20).map((i) => (
                      <li key={i.item_id} className="truncate text-slate-300" title={nomes[String(i.item_id)] || String(i.item_id)}>
                        <span className="text-orange-300">{i.reason != null ? MOTIVO_ANUNCIO[i.reason] || `motivo ${i.reason}` : "—"}</span> ·{" "}
                        {nomes[String(i.item_id)] || i.item_id}
                      </li>
                    ))}
                    {is.length > 20 && <li className="text-slate-500">… e mais {is.length - 20}</li>}
                  </ul>
                )}
              </div>
            </div>
          </section>
        );
      })}

      <p className="mt-6 text-xs text-slate-500">
        <b>Nota geral</b> é a classificação da Shopee (Ruim → Excelente). <b>Meta</b> &quot;até&quot; = a métrica precisa ficar abaixo;
        &quot;mín.&quot; = precisa ficar acima. Pontos de penalidade acumulam por trimestre e disparam punições por faixa (anúncios ocultos,
        sem campanhas, limite de pedidos, suspensão). Alertas no Telegram: métrica fora da meta (1x/dia), ponto ou punição nova (1x),
        pedidos atrasados e anúncios com problema (1x/dia), queda da nota.
      </p>
    </div>
  );
}
