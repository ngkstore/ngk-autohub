import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { escopoDoUsuario, podeVerLoja } from "@/lib/conta";
import AjusteAds from "../../components/AjusteAds";

export const dynamic = "force-dynamic";

// Painel do produto no Ads: performance (impressões, cliques, CTR, pedidos,
// conversão, CPC, custo por venda), GMV da Shopee (direto/amplo) x GMV REAL
// (pedidos pagos), ROAS Shopee x real x mínimo, recomendação do dia, relógio das
// janelas, ajuste assistido de orçamento/meta e histórico de alterações.
type Props = { searchParams: Promise<{ loja?: string; item?: string }> };
type Row = Record<string, unknown>;

const n = (v: unknown) => Number(v || 0);
const brl = (v: unknown) => n(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const brl2 = (v: unknown) => n(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });
const pct = (v: unknown) => `${(n(v) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
const x1 = (v: unknown) => `${n(v).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}×`;
const int = (v: unknown) => n(v).toLocaleString("pt-BR");
const diaBr = (s: string) => new Date(`${s}T12:00:00-03:00`).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" });
const ROTULO: Record<string, string> = {
  campeao: "Campeão", abaixo_do_minimo: "Abaixo do mínimo", meta_desalinhada: "Meta desalinhada",
  aprendizado: "Aprendizado", sem_margem: "Sem custo", saudavel: "Saudável",
  problema_anuncio: "Problema no anúncio", problema_pagina: "Problema na página", meta_nao_entregue: "Meta não entregue",
  orcamento_esgotando: "Orçamento esgotando", estabilizacao: "Estabilização", pronto_proximo_degrau: "Pronto p/ próximo degrau",
  retomar_meta: "Retomar meta anterior",
};
const COR: Record<string, string> = {
  campeao: "text-emerald-300", pronto_proximo_degrau: "text-emerald-300", abaixo_do_minimo: "text-red-300", retomar_meta: "text-red-300",
  aprendizado: "text-blue-300", estabilizacao: "text-blue-300", sem_margem: "text-slate-400", saudavel: "text-slate-300",
  orcamento_esgotando: "text-amber-300",
};

function Kpi({ label, val, hint, cor }: { label: string; val: string; hint?: string; cor?: string }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
      <p className="text-xs text-slate-400">{label}</p>
      <p className={`mt-1 text-xl font-bold ${cor || "text-white"}`}>{val}</p>
      {hint && <p className="mt-1 text-[11px] text-slate-500">{hint}</p>}
    </div>
  );
}

type Soma = { gasto: number; imp: number; cli: number; ped: number; gmv: number };
function agg(rows: Row[]) {
  const s = rows.reduce<Soma>(
    (a, r) => ({ gasto: a.gasto + n(r.gasto), imp: a.imp + n(r.impressoes), cli: a.cli + n(r.cliques), ped: a.ped + n(r.pedidos), gmv: a.gmv + n(r.gmv) }),
    { gasto: 0, imp: 0, cli: 0, ped: 0, gmv: 0 }
  );
  return {
    ...s,
    ctr: s.imp > 0 ? s.cli / s.imp : 0,
    cr: s.cli > 0 ? s.ped / s.cli : 0,
    cpc: s.cli > 0 ? s.gasto / s.cli : 0,
    custoVenda: s.ped > 0 ? s.gasto / s.ped : 0,
    roas: s.gasto > 0 ? s.gmv / s.gasto : 0,
  };
}

export default async function AdsItemPage({ searchParams }: Props) {
  const params = await searchParams;
  const lojaId = params.loja || "";
  const itemId = Number(params.item);
  const escopo = await escopoDoUsuario();
  if (!lojaId || !Number.isFinite(itemId) || !podeVerLoja(escopo, lojaId)) {
    return (
      <div className="p-8 text-white">
        <Link href="/ads-controle" className="text-sm text-slate-400 hover:text-white">← Controle de Ads</Link>
        <p className="mt-6 text-slate-400">Item não encontrado ou loja fora da sua conta.</p>
      </div>
    );
  }

  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const menos = (dias: number) => new Date(new Date(`${hoje}T12:00:00-03:00`).getTime() - dias * 864e5).toISOString().slice(0, 10);
  const ini28 = menos(28), ini7 = menos(7);

  const [{ data: cfgRaw }, { data: recRaw }, { data: perfRaw }, { data: prodRaw }, { data: gmvRaw }, { data: altRaw }, { data: ajRaw }, { data: lojaRaw }] =
    await Promise.all([
      supabase.from("ads_campaign_config_daily").select("*").eq("loja_id", lojaId).eq("item_id", itemId).order("dia", { ascending: false }).limit(10),
      supabase.from("ads_recomendacoes").select("*").eq("loja_id", lojaId).eq("item_id", itemId).eq("dia", hoje).maybeSingle(),
      supabase.from("ads_item_performance_daily").select("dia, escopo, campaign_id, gasto, impressoes, cliques, pedidos, gmv, roas").eq("loja_id", lojaId).eq("item_id", itemId).gte("dia", ini28).order("dia"),
      supabase.from("produtos").select("nome, preco, custo, estoque, status, imagem_url, categoria").eq("loja_id", lojaId).eq("item_id", String(itemId)).limit(1).maybeSingle(),
      supabase.rpc("ads_item_gmv_real", { p_loja: lojaId, p_item: itemId, p_dias: 28 }),
      supabase.from("ads_alteracoes").select("*").eq("loja_id", lojaId).eq("item_id", itemId).order("data_deteccao", { ascending: false }).limit(10),
      supabase.from("ads_ajustes").select("*").eq("loja_id", lojaId).eq("item_id", itemId).order("criado_em", { ascending: false }).limit(8),
      supabase.from("lojas").select("nome, nome_publico, apelido").eq("id", lojaId).maybeSingle(),
    ]);

  // Config: prefere a campanha ativa (ongoing/paused) do snapshot mais recente.
  const cfgs = (cfgRaw as Row[]) || [];
  const cfg = cfgs.find((c) => ["ongoing", "paused"].includes(String(c.status))) || cfgs[0] || null;
  const rec = (recRaw as Row) || null;
  const perf = (perfRaw as Row[]) || [];
  const prod = (prodRaw as Row) || null;
  const gmvReal = (gmvRaw as Row[]) || [];
  const alteracoes = (altRaw as Row[]) || [];
  const ajustes = (ajRaw as Row[]) || [];
  const loja = (lojaRaw as Row) || {};
  const nomeLoja = String(loja.nome_publico || loja.apelido || loja.nome || "");
  const nome = String(prod?.nome || `item ${itemId}`);

  const direto = perf.filter((p) => p.escopo === "direto");
  const amplo = perf.filter((p) => p.escopo === "amplo");
  const a7 = agg(direto.filter((p) => String(p.dia) >= ini7));
  const a28 = agg(direto);
  const gmvAmplo7 = amplo.filter((p) => String(p.dia) >= ini7).reduce((s, p) => s + n(p.gmv), 0);
  const gmvAmplo28 = amplo.reduce((s, p) => s + n(p.gmv), 0);
  const real7 = gmvReal.filter((g) => String(g.dia) >= ini7).reduce((s, g) => s + n(g.gmv_real), 0);
  const real28 = gmvReal.reduce((s, g) => s + n(g.gmv_real), 0);
  const ped7Real = gmvReal.filter((g) => String(g.dia) >= ini7).reduce((s, g) => s + n(g.pedidos), 0);
  const realPorDia: Record<string, number> = Object.fromEntries(gmvReal.map((g) => [String(g.dia), n(g.gmv_real)]));
  const amploPorDia: Record<string, number> = Object.fromEntries(amplo.map((p) => [String(p.dia), n(p.gmv)]));

  const metaAtual = cfg?.meta_roas != null ? n(cfg.meta_roas) : null;
  const orcAtual = cfg?.orcamento != null ? n(cfg.orcamento) : null;
  const metaCalc = rec?.meta_calculada != null ? n(rec.meta_calculada) : null;
  // Meta sugerida vem do motor (v3.2): degrau pra cima (pronto/desalinhada), pra baixo
  // (meta não entregue: −15% até o piso de empate) ou a meta anterior (retomar_meta).
  const metaSugerida = rec?.meta_sugerida != null ? n(rec.meta_sugerida) : null;
  const ehRetomar = String(rec?.classificacao) === "retomar_meta";
  const campaignId = n(rec?.campaign_id || cfg?.campaign_id);
  const janela = rec ? String(rec.estado_janela || "livre") : null;
  const degrau = (rec?.degrau_avaliacao as Row | null) || null;
  const { data: refRaw } = campaignId > 0
    ? await supabase.from("ads_reforcos").select("*").eq("loja_id", lojaId).eq("campaign_id", campaignId).order("dia", { ascending: false }).limit(5)
    : { data: null };
  const reforcos = (refRaw as Row[]) || [];
  const reforcoHoje = reforcos.find((r) => String(r.dia) === hoje && !r.revertido_em) || null;

  return (
    <div className="p-8 text-white">
      <Link href={`/ads-controle?loja=${lojaId}`} className="text-sm text-slate-400 hover:text-white">← Controle de Ads · {nomeLoja}</Link>

      {/* Cabeçalho do produto */}
      <div className="mt-4 flex flex-wrap items-start gap-5">
        {prod?.imagem_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={String(prod.imagem_url)} alt="" className="h-24 w-24 rounded-xl object-cover" />
        ) : null}
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold">{nome}</h1>
          <p className="mt-1 text-xs text-slate-500">
            item {itemId} · campanha {campaignId || "—"} · {cfg ? `${String(cfg.status)} desde ${cfg.data_inicio ? diaBr(String(cfg.data_inicio)) : "—"}` : "sem config"}
            {prod?.categoria ? ` · ${String(prod.categoria)}` : ""}
          </p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1">Meta ROAS <b>{metaAtual != null ? x1(metaAtual) : "—"}</b></span>
            <span className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1">Orçamento/dia <b>{orcAtual != null ? (orcAtual === 0 ? "sem limite" : brl(orcAtual)) : "—"}</b></span>
            {prod?.preco != null && <span className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1">Preço <b>{brl2(prod.preco)}</b></span>}
            {prod?.custo != null && <span className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1">Custo <b>{brl2(prod.custo)}</b></span>}
            {prod?.estoque != null && <span className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1">Estoque <b>{int(prod.estoque)}</b></span>}
            {janela && (
              <span className={`rounded-full border border-slate-700 bg-slate-900 px-3 py-1 ${janela === "livre" ? "text-slate-400" : "text-blue-300"}`}>
                🕐 {janela}{janela !== "livre" ? ` · faltam ${n(rec?.dias_restantes_janela)}d` : ""}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Recomendação do dia */}
      {rec ? (
        <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <p className="text-xs text-slate-400">Recomendação de hoje</p>
          <p className={`mt-1 text-lg font-bold ${COR[String(rec.classificacao)] || "text-orange-300"}`}>{ROTULO[String(rec.classificacao)] || String(rec.classificacao)}</p>
          <p className="mt-1 text-sm text-slate-200">{String(rec.acao)}</p>
          <p className="mt-1 text-xs text-slate-500">{String(rec.detalhe || "")}{rec.motivo_supressao ? ` · ${String(rec.motivo_supressao)}` : ""}{rec.status === "aplicada" ? " · ✓ aplicada hoje" : ""}</p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full border border-slate-700 px-3 py-1">ROAS real <b>{x1(rec.roas_real)}</b> (Shopee {x1(rec.roas_shopee)} × fator {n(rec.fator).toFixed(3)})</span>
            <span className="rounded-full border border-slate-700 px-3 py-1">ROAS mínimo <b>{rec.roas_minimo != null ? x1(rec.roas_minimo) : "—"}</b></span>
            <span className="rounded-full border border-slate-700 px-3 py-1">Meta calculada <b>{metaCalc != null ? x1(metaCalc) : "—"}</b></span>
            <span className="rounded-full border border-slate-700 px-3 py-1">Orçamento ideal <b>{rec.orcamento_ideal != null ? brl(rec.orcamento_ideal) : "—"}</b>{rec.censurado_teto ? " (no teto)" : ""} · gasto normal/dia: 28d {rec.gasto_medio_normal_28d != null ? brl(rec.gasto_medio_normal_28d) : "—"} · 7d {rec.gasto_medio_normal_7d != null ? brl(rec.gasto_medio_normal_7d) : "—"}</span>
            {rec.promo ? <span className="rounded-full border border-amber-700 px-3 py-1 text-amber-300">🏷️ em promoção</span> : null}
          </div>
        </div>
      ) : (
        <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-900 p-5 text-sm text-slate-400">Sem recomendação hoje (item sem gasto nos últimos 7 dias ou campanha inativa).</div>
      )}

      {/* Avaliação pós-degrau: como o anúncio se moveu depois da última troca de meta */}
      {degrau && (
        <div className={`mt-4 rounded-2xl border p-5 ${degrau.veredito === "regrediu" ? "border-red-800 bg-red-950/30" : "border-slate-800 bg-slate-900"}`}>
          <p className="text-xs text-slate-400">Movimento após a troca de meta {x1(degrau.meta_antes)} → {x1(degrau.meta_depois)} em {diaBr(String(degrau.data_troca))} ({int(degrau.dias_depois)} dias depois)</p>
          <div className="mt-2 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
            <div><p className="text-[11px] text-slate-500">GMV/dia</p><p className="tabular-nums">{brl(degrau.gmv_dia_antes)} → <b>{brl(degrau.gmv_dia_depois)}</b></p></div>
            <div><p className="text-[11px] text-slate-500">Gasto/dia</p><p className="tabular-nums">{brl(degrau.gasto_dia_antes)} → <b>{brl(degrau.gasto_dia_depois)}</b></p></div>
            <div><p className="text-[11px] text-slate-500">ROAS Shopee</p><p className="tabular-nums">{x1(degrau.roas_antes)} → <b>{x1(degrau.roas_depois)}</b></p></div>
            <div><p className="text-[11px] text-slate-500">Lucro/dia estimado</p><p className="tabular-nums">{brl(degrau.lucro_dia_antes)} → <b>{brl(degrau.lucro_dia_depois)}</b></p></div>
          </div>
          <p className={`mt-2 text-xs ${degrau.veredito === "regrediu" ? "text-red-300" : "text-slate-400"}`}>
            {degrau.veredito === "regrediu"
              ? "Perdeu volume e lucro depois de subir a meta: vale voltar à meta anterior pra reaquecer o público."
              : degrau.veredito === "volume_caiu_lucro_ok"
                ? "Volume caiu mais de 30%, mas o lucro/dia se manteve ou subiu: o degrau compensou."
                : "Volume e lucro mantidos: o degrau foi bem absorvido."}
            {" "}Lucro/dia = GMV × fator × margem − gasto.
          </p>
        </div>
      )}

      {/* Reforço automático do dia */}
      {reforcoHoje && (
        <div className="mt-4 rounded-2xl border border-amber-800 bg-amber-950/20 p-4 text-sm">
          ⚡ <b>Reforço automático ativo hoje:</b> orçamento base {brl(reforcoHoje.orcamento_base)} → atual <b>{brl(reforcoHoje.orcamento_atual)}</b> ({int(reforcoHoje.reforcos)}× reforço). Volta ao base à meia-noite.
          {Array.isArray(reforcoHoje.historico) && (reforcoHoje.historico as Row[]).length > 0 && (
            <span className="text-xs text-slate-400"> · {(reforcoHoje.historico as Row[]).map((h) => `${h.hora}h: ${brl(h.de)}→${brl(h.para)} (gasto ${brl(h.gasto)}, ROAS ${x1(h.roas_hoje)})`).join(" · ")}</span>
          )}
        </div>
      )}
      {!reforcoHoje && reforcos.length > 0 && (
        <p className="mt-3 text-xs text-slate-500">⚡ Reforços automáticos recentes: {reforcos.slice(0, 3).map((r) => `${diaBr(String(r.dia))} ${brl(r.orcamento_base)}→${brl(r.orcamento_atual)} (${int(r.reforcos)}×${r.revertido_em ? ", revertido" : ""})`).join(" · ")}</p>
      )}

      {/* KPIs 7 dias (28 no rodapé de cada card) */}
      <h2 className="mt-8 text-lg font-bold">Últimos 7 dias <span className="text-sm font-normal text-slate-500">(entre parênteses: 28 dias)</span></h2>
      <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
        <Kpi label="Gasto" val={brl(a7.gasto)} hint={`28d ${brl(a28.gasto)}`} cor="text-orange-300" />
        <Kpi label="Impressões" val={int(a7.imp)} hint={`28d ${int(a28.imp)}`} />
        <Kpi label="Cliques · CTR" val={`${int(a7.cli)} · ${pct(a7.ctr)}`} hint={`28d ${int(a28.cli)} · ${pct(a28.ctr)}`} />
        <Kpi label="Pedidos · conversão" val={`${int(a7.ped)} · ${pct(a7.cr)}`} hint={`28d ${int(a28.ped)} · ${pct(a28.cr)}`} />
        <Kpi label="CPC · custo por venda" val={`${brl2(a7.cpc)} · ${brl2(a7.custoVenda)}`} hint={`28d ${brl2(a28.cpc)} · ${brl2(a28.custoVenda)}`} />
        <Kpi label="ROAS Shopee (direto)" val={x1(a7.roas)} hint={`28d ${x1(a28.roas)}`} cor="text-emerald-300" />
        <Kpi label="GMV Shopee direto" val={brl(a7.gmv)} hint={`28d ${brl(a28.gmv)}`} />
        <Kpi label="GMV Shopee amplo" val={brl(gmvAmplo7)} hint={`28d ${brl(gmvAmplo28)} · loja após o clique`} />
        <Kpi label="GMV real (pedidos pagos)" val={brl(real7)} hint={`28d ${brl(real28)} · ${int(ped7Real)} pedidos em 7d · todo o item, não só via Ads`} cor="text-violet-300" />
        <Kpi label="ROAS real / mínimo" val={rec ? `${x1(rec.roas_real)} / ${rec.roas_minimo != null ? x1(rec.roas_minimo) : "—"}` : "—"} hint="real = Shopee × fator de efetivação" cor="text-emerald-300" />
      </div>

      {/* Ajuste assistido */}
      {campaignId > 0 && (
        <div className="mt-8">
          <AjusteAds
            lojaId={lojaId}
            campaignId={campaignId}
            itemId={itemId}
            orcamentoAtual={orcAtual}
            metaAtual={metaAtual}
            orcamentoSugerido={rec?.orcamento_ideal != null && n(rec.orcamento_ideal) > 0 ? n(rec.orcamento_ideal) : null}
            metaSugerida={ehRetomar ? null : metaSugerida}
            metaAnterior={ehRetomar ? metaSugerida : null}
            reforcoBase={reforcoHoje ? n(reforcoHoje.orcamento_base) : null}
            janela={janela}
            diasRestantes={rec ? n(rec.dias_restantes_janela) : null}
          />
        </div>
      )}

      {/* Diário 28 dias */}
      <h2 className="mt-8 text-lg font-bold">Dia a dia (28 dias)</h2>
      <div className="mt-3 overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-800 text-xs uppercase text-slate-400">
            <tr>
              <th className="p-3">Dia</th>
              <th className="p-3 text-right">Gasto</th>
              <th className="p-3 text-right">Impr.</th>
              <th className="p-3 text-right">Cliques</th>
              <th className="p-3 text-right">CTR</th>
              <th className="p-3 text-right">Pedidos</th>
              <th className="p-3 text-right">Conv.</th>
              <th className="p-3 text-right">CPC</th>
              <th className="p-3 text-right">GMV direto</th>
              <th className="p-3 text-right">GMV amplo</th>
              <th className="p-3 text-right">GMV real</th>
              <th className="p-3 text-right">ROAS</th>
            </tr>
          </thead>
          <tbody>
            {direto.length === 0 ? (
              <tr><td className="p-4 text-slate-400" colSpan={12}>Sem performance coletada nos últimos 28 dias.</td></tr>
            ) : [...direto].reverse().map((p) => {
              const d = String(p.dia), imp = n(p.impressoes), cli = n(p.cliques), ped = n(p.pedidos), g = n(p.gasto), gmv = n(p.gmv);
              return (
                <tr key={d} className="border-t border-slate-800">
                  <td className="p-3 text-xs text-slate-400">{diaBr(d)}</td>
                  <td className="p-3 text-right tabular-nums">{brl2(g)}</td>
                  <td className="p-3 text-right tabular-nums text-slate-300">{int(imp)}</td>
                  <td className="p-3 text-right tabular-nums text-slate-300">{int(cli)}</td>
                  <td className="p-3 text-right tabular-nums text-slate-400">{imp > 0 ? pct(cli / imp) : "—"}</td>
                  <td className="p-3 text-right tabular-nums">{int(ped)}</td>
                  <td className="p-3 text-right tabular-nums text-slate-400">{cli > 0 ? pct(ped / cli) : "—"}</td>
                  <td className="p-3 text-right tabular-nums text-slate-400">{cli > 0 ? brl2(g / cli) : "—"}</td>
                  <td className="p-3 text-right tabular-nums">{brl(gmv)}</td>
                  <td className="p-3 text-right tabular-nums text-slate-400">{brl(amploPorDia[d] ?? 0)}</td>
                  <td className="p-3 text-right tabular-nums text-violet-300">{brl(realPorDia[d] ?? 0)}</td>
                  <td className={`p-3 text-right tabular-nums ${g > 0 && rec?.roas_minimo != null && gmv / g < n(rec.roas_minimo) ? "text-red-300" : "text-emerald-300"}`}>{g > 0 ? x1(gmv / g) : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Histórico */}
      {(alteracoes.length > 0 || ajustes.length > 0) && (
        <div className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <h3 className="font-bold">🕐 Alterações detectadas</h3>
            {alteracoes.length === 0 ? <p className="mt-2 text-xs text-slate-500">Nenhuma desde o início da coleta (10/09).</p> : (
              <ul className="mt-2 space-y-1 text-xs text-slate-300">
                {alteracoes.map((a) => (
                  <li key={String(a.id)}>{diaBr(String(a.data_deteccao))} · <b>{String(a.campo)}</b>: {String(a.valor_antigo ?? "—")} → {String(a.valor_novo ?? "—")}</li>
                ))}
              </ul>
            )}
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <h3 className="font-bold">⚙️ Ajustes feitos pelo sistema</h3>
            {ajustes.length === 0 ? <p className="mt-2 text-xs text-slate-500">Nenhum ainda.</p> : (
              <ul className="mt-2 space-y-1 text-xs text-slate-300">
                {ajustes.map((a) => (
                  <li key={String(a.id)}>
                    {new Date(String(a.criado_em)).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })} · <b>{String(a.campo)}</b>: {String(a.valor_antigo ?? "—")} → {String(a.valor_novo)}
                    {a.sucesso ? <span className="text-emerald-300"> ✓</span> : <span className="text-red-300"> ✗</span>}{a.simulado ? " (simulado)" : ""}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      <p className="mt-6 text-xs text-slate-500">
        <b>GMV real</b> = receita dos pedidos pagos do item (todos os canais, não só atribuídos ao Ads) — compare com o GMV da Shopee pra ver quanto do que o anúncio &quot;reporta&quot; virou venda de verdade.
        <b> Meta desalinhada</b>: a meta ROAS configurada difere &gt;15% da meta calculada (máx. entre 30× e o ROAS mínimo, ÷ fator). Meta abaixo da calculada = você aceita retorno menor que o necessário → suba em degraus de ~15%; meta acima = a Shopee entrega menos do que poderia → desça em degraus. Espere 12 dias entre degraus (janela de estabilização).
      </p>
    </div>
  );
}
