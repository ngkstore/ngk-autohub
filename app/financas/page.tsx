import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { escopoDoUsuario, filtroLojas } from "@/lib/conta";
import CustoInput from "../components/CustoInput";
import CustoVariacaoInput from "../components/CustoVariacaoInput";
import UploadCustos from "../components/UploadCustos";
import ImpostoForm from "../components/ImpostoForm";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ aba?: string; periodo?: string; loja?: string }>;
};

// ---------- período (Brasília, fim exclusivo) ----------
function diaBRT(d: Date) {
  return d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}
function isoBRT(a: number, m: number, d: number) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${a}-${p(m)}-${p(d)}T00:00:00-03:00`;
}
// Mesmas chaves do seletor de período da Topbar (filtro unificado).
function periodoFiltro(periodo: string): { inicio: string; fim: string } | null {
  const [a, m, d] = diaBRT(new Date()).split("-").map(Number);
  const base = new Date(Date.UTC(a, m - 1, d));
  const desloca = (dias: number) => {
    const x = new Date(base);
    x.setUTCDate(x.getUTCDate() + dias);
    return isoBRT(x.getUTCFullYear(), x.getUTCMonth() + 1, x.getUTCDate());
  };
  const amanha = desloca(1);
  const inicioHoje = isoBRT(a, m, d);
  switch (periodo) {
    case "hoje": return { inicio: inicioHoje, fim: amanha };
    case "ontem": return { inicio: desloca(-1), fim: inicioHoje };
    case "7dias": return { inicio: desloca(-7), fim: amanha };
    case "30dias": return { inicio: desloca(-30), fim: amanha };
    case "mes": return { inicio: isoBRT(a, m, 1), fim: amanha };
    case "ano": return { inicio: isoBRT(a, 1, 1), fim: amanha };
    case "todos": return null;
    default: return { inicio: desloca(-30), fim: amanha }; // padrão: 30 dias
  }
}

const ABAS = [
  { k: "balanco", r: "📊 Balanço" },
  { k: "conciliacao", r: "🧮 Conciliação & Taxas" },
  { k: "previsao", r: "📅 Previsão" },
  { k: "carteira", r: "👛 Carteira" },
  { k: "ads", r: "📢 Ads" },
  { k: "produtos", r: "🏷️ Produtos & Margem" },
  { k: "variacoes", r: "🧩 Custo por variação" },
  { k: "impostos", r: "🧾 Impostos" },
];

function diaLabel(s: string) {
  return new Date(`${s}T12:00:00-03:00`).toLocaleDateString("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  });
}
function addDiasBRT(nd: number) {
  const s = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + nd)).toISOString().slice(0, 10);
}

function brl(v: number) {
  return (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function n(v: unknown) {
  return Number(v || 0);
}
function int(v: unknown) {
  return (Number(v) || 0).toLocaleString("pt-BR");
}
function mesesRecentes(qtd = 12) {
  const out: { v: string; l: string }[] = [];
  const h = new Date();
  for (let i = 0; i < qtd; i++) {
    const d = new Date(h.getFullYear(), h.getMonth() - i, 1);
    const v = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const l = d.toLocaleDateString("pt-BR", { month: "short", year: "numeric" }).replace(".", "");
    out.push({ v, l });
  }
  return out;
}
function dt(s?: string | null) {
  return s ? new Date(s).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";
}

export default async function FinancasPage({ searchParams }: Props) {
  const params = await searchParams;
  const aba = params.aba || "balanco";
  const periodoK = params.periodo || "30dias"; // padrão alinhado com a Topbar
  const escopo = await escopoDoUsuario();
  const lojas = filtroLojas(escopo, params.loja); // string[] | null
  const periodo = periodoFiltro(periodoK);

  // Troca de aba preserva loja/período (que vêm da Topbar).
  const qs = new URLSearchParams();
  if (params.periodo) qs.set("periodo", params.periodo);
  if (params.loja) qs.set("loja", params.loja);
  const sufixo = qs.toString() ? `&${qs.toString()}` : "";
  const linkAba = (k: string) => `/financas?aba=${k}${sufixo}`;

  return (
    <div className="p-8 text-white">
      <h1 className="text-4xl font-bold">💰 Finanças</h1>
      <p className="mt-2 text-slate-400">
        Tudo do dinheiro num lugar só — do pedido ao resultado. Use os seletores de
        <b> loja</b> e <b>período</b> no topo.
      </p>

      {/* sub-abas */}
      <div className="mt-6 flex flex-wrap gap-1 border-b border-slate-800">
        {ABAS.map((t) => (
          <Link
            key={t.k}
            href={linkAba(t.k)}
            className={`-mb-px rounded-t-lg border-b-2 px-4 py-3 text-sm ${
              t.k === aba
                ? "border-emerald-500 font-semibold text-white"
                : "border-transparent text-slate-400 hover:bg-slate-800 hover:text-white"
            }`}
          >
            {t.r}
          </Link>
        ))}
      </div>

      <div className="mt-8">
        {aba === "balanco" && <Balanco lojas={lojas} periodo={periodo} conta={escopo.contaId} />}
        {(aba === "conciliacao" || aba === "divergencias") && <Conciliacao lojas={lojas} periodo={periodo} />}
        {aba === "previsao" && <Previsao lojas={lojas} />}
        {aba === "carteira" && <Carteira lojas={lojas} />}
        {aba === "ads" && <Ads lojas={lojas} />}
        {aba === "produtos" && <Produtos lojas={lojas} />}
        {aba === "variacoes" && <Variacoes lojas={lojas} />}
        {aba === "impostos" && <Impostos conta={escopo.contaId} />}
      </div>
    </div>
  );
}

type Periodo = { inicio: string; fim: string } | null;

// ---------------- BALANÇO (DRE) ----------------
async function Balanco({ lojas, periodo, conta }: { lojas: string[] | null; periodo: Periodo; conta: string | null }) {
  const [{ data }, { data: dataCmv }] = await Promise.all([
    supabase.rpc("resumo_financas", {
      p_loja_ids: lojas,
      p_inicio: periodo?.inicio ?? null,
      p_fim: periodo?.fim ?? null,
      p_conta: conta,
    }),
    supabase.rpc("resumo_cmv", {
      p_loja_ids: lojas,
      p_inicio: periodo?.inicio ?? null,
      p_fim: periodo?.fim ?? null,
    }),
  ]);
  const r = (data as Record<string, unknown>) || {};
  const c = (dataCmv as Record<string, unknown>) || {};
  const receita = n(r.receita_bruta);
  const taxaServAfiliado = Math.abs(n(r.taxa_servico_afiliado)); // taxa de serviço de afiliado
  const taxas = Math.abs(n(r.taxas)) - taxaServAfiliado; // taxas Shopee SEM a de afiliado (separada)
  const cupom = Math.abs(n(r.cupom_proprio)); // cupom_loja vem negativo no banco
  const afiliado = Math.abs(n(r.afiliado)); // comissão de afiliado (liquida ~30 dias depois)
  const liquida = n(r.receita_liquida);
  const ads = n(r.ads);
  const reemb = n(r.reembolsos);
  const imposto = n(r.imposto);
  const resultado = liquida - ads - reemb - imposto;
  const margem = receita > 0 ? (resultado / receita) * 100 : 0;

  // CMV: custo da mercadoria vendida no período. Cobertura = % de itens com custo.
  const cmv = n(c.cmv);
  const itensTotal = n(c.itens_total);
  const itensComCusto = n(c.itens_com_custo);
  const cobertura = itensTotal > 0 ? (itensComCusto / itensTotal) * 100 : 0;
  const lucro = resultado - cmv;
  const margemLucro = receita > 0 ? (lucro / receita) * 100 : 0;

  const linhas = [
    { l: "Receita (pedidos pagos)", v: receita, tot: false },
    { l: "(−) Taxas Shopee (comissão + serviço)", v: -taxas, tot: false },
    { l: "(−) Comissão de afiliado (liquida ~30 dias depois)", v: -afiliado, tot: false },
    { l: "(−) Taxa de serviço de afiliado", v: -taxaServAfiliado, tot: false },
    { l: "(−) Cupom próprio (Shopee não entra)", v: -cupom, tot: false },
    { l: "= Receita líquida (escrow)", v: liquida, tot: true },
    { l: "(−) Ads (saída da carteira)", v: -ads, tot: false },
    { l: "(−) Reembolsos / devoluções", v: -reemb, tot: false },
    { l: "(−) Imposto lançado", v: -imposto, tot: false },
    { l: "= Resultado (antes do custo)", v: resultado, tot: true },
    { l: `(−) Custo da mercadoria (CMV${cobertura < 100 ? ` · ${cobertura.toFixed(0)}% dos itens` : ""})`, v: -cmv, tot: false },
    { l: "= Lucro líquido", v: lucro, tot: true },
  ];

  return (
    <div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Kpi label="Lucro líquido" val={cobertura > 0 ? brl(lucro) : "—"} hint={cobertura > 0 ? `margem ${margemLucro.toFixed(1)}% · ${cobertura.toFixed(0)}% dos itens c/ custo` : "cadastre os custos p/ ver"} cor={lucro >= 0 ? "text-emerald-300" : "text-red-300"} />
        <Kpi label="Recebido" val={brl(n(r.recebido))} hint={`${n(r.qtd_recebido)} pedido(s)`} cor="text-emerald-300" />
        <Kpi label="Falta receber" val={brl(n(r.a_receber))} hint={`${n(r.qtd_a_receber)} pedido(s)`} cor="text-blue-300" />
        <Kpi label="Resultado" val={brl(resultado)} hint="antes do custo da mercadoria" />
        <Kpi label="Afiliado pago" val={brl(afiliado)} hint={`${n(r.qtd_afiliado)} pedido(s) · custo opcional`} cor="text-violet-300" />
        <Kpi label="Cupom próprio" val={brl(cupom)} hint={`${n(r.qtd_cupom)} pedido(s)`} cor="text-orange-300" />
      </div>

      <div className="mt-8 rounded-2xl border border-slate-800 bg-slate-900 p-6">
        <h2 className="mb-2 text-xl font-bold">Do bruto ao resultado</h2>
        <div className="divide-y divide-slate-800">
          {linhas.map((li) => (
            <div
              key={li.l}
              className={`flex items-center justify-between py-3 ${li.tot ? "rounded-lg bg-slate-800 px-3 font-bold" : ""}`}
            >
              <span>{li.l}</span>
              <span className={li.v < 0 ? "text-red-300" : li.tot ? "text-emerald-300" : ""}>
                {li.v < 0 ? `− ${brl(Math.abs(li.v))}` : brl(li.v)}
              </span>
            </div>
          ))}
        </div>
        <p className="mt-4 text-xs text-slate-500">
          {cobertura < 100 ? (
            <>O <b>lucro líquido</b> considera o custo de <b>{cobertura.toFixed(0)}%</b> dos itens vendidos —
            cadastre o custo dos produtos restantes na aba <b>Produtos &amp; Margem</b> pra fechar 100%. </>
          ) : (
            <>O <b>lucro líquido</b> já desconta o custo de <b>todos</b> os itens vendidos. </>
          )}
          A conciliação (recebido) é preenchida pela sincronização da carteira.
        </p>
      </div>

      {Array.isArray(r.por_uf) && (r.por_uf as unknown[]).length > 0 && (
        <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="mb-4 text-xl font-bold">Vendas por região (UF)</h2>
          <div className="flex flex-wrap gap-2">
            {(r.por_uf as { uf: string; pedidos: number; valor: number }[]).map((u) => (
              <span key={u.uf} className="rounded-lg bg-slate-800 px-3 py-2 text-sm">
                <b>{u.uf}</b> · {u.pedidos} ped. · {brl(u.valor)}
              </span>
            ))}
          </div>
          <p className="mt-3 text-xs text-slate-500">Região vem do código de triagem (sort_code) do envio.</p>
        </div>
      )}
    </div>
  );
}

// -------- CONCILIAÇÃO & TAXAS (recebimento + divergências + auditoria) --------
async function Conciliacao({ lojas, periodo }: { lojas: string[] | null; periodo: Periodo }) {
  let qPed = supabase
    .from("pedidos")
    .select("pedido_externo_id, cliente_nome, valor_total, valor_liquido, valor_recebido, recebido_em, status, uf")
    .eq("marketplace", "shopee")
    .eq("pedido_efetivado", true)
    .order("data_pedido", { ascending: false })
    .limit(400);
  if (lojas) qPed = qPed.in("loja_id", lojas);
  if (periodo) qPed = qPed.gte("data_pedido", periodo.inicio).lt("data_pedido", periodo.fim);

  let qAud = supabase
    .from("pedidos_auditoria")
    .select("pedido_externo_id, cliente_nome, valor_total, taxa_esperada, taxa_real, taxa_diferenca")
    .order("taxa_diferenca", { ascending: false })
    .limit(25);
  if (lojas) qAud = qAud.in("loja_id", lojas);
  if (periodo) qAud = qAud.gte("data_pedido", periodo.inicio).lt("data_pedido", periodo.fim);

  const argsPer = { p_loja_ids: lojas, p_inicio: periodo?.inicio ?? null, p_fim: periodo?.fim ?? null };
  const [{ data: pedRaw }, { data: conRaw }, { data: divRaw }, { data: audResRaw }, { data: audListRaw }] =
    await Promise.all([
      qPed,
      supabase.rpc("resumo_conciliacao", argsPer),
      supabase.rpc("divergencias_recebimento", { ...argsPer, p_limite: 200 }),
      supabase.rpc("auditoria_resumo", argsPer),
      qAud,
    ]);

  const pedidos = (pedRaw as Record<string, unknown>[]) || [];
  const con = (conRaw as Record<string, unknown>) || {};
  const divergencias =
    (divRaw as { pedido_externo_id: string; cliente_nome: string | null; esperado: number; recebido: number; dif: number }[]) || [];
  const aud = (audResRaw as Record<string, unknown>) || {};
  const audList = ((audListRaw as Record<string, unknown>[]) || []).filter((a) => n(a.taxa_diferenca) > 0.5);
  const meses = mesesRecentes();

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Recebidos" val={int(n(con.recebidos))} hint={`de ${int(n(con.total))} no período`} cor="text-emerald-300" />
        <Kpi label="A receber" val={int(n(con.a_receber))} hint="ainda não caíram" cor="text-blue-300" />
        <Kpi label="Divergência no recebido" val={int(n(con.divergentes))} hint={n(con.divergentes) > 0 ? brl(n(con.diverg_valor)) : "tudo certo"} cor={n(con.divergentes) ? "text-red-300" : undefined} />
        <Kpi label="Taxa cobrada a mais" val={brl(n(aud.cobrado_a_mais))} hint={`${int(aud.divergentes)} fora da sua tabela`} cor="text-orange-300" />
      </div>

      {/* 1 — Recebimento */}
      <section>
        <h2 className="mb-1 text-xl font-bold">Recebimento</h2>
        <p className="mb-3 text-xs text-slate-500">
          Pedido × carteira: o que o escrow prometeu (esperado) vs o que caiu (recebido). A coluna
          &quot;Recebido&quot; aparece após a sincronização da carteira.
        </p>
        <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-800 text-xs uppercase text-slate-400">
              <tr>
                <th className="p-3">Pedido</th><th className="p-3">Cliente</th><th className="p-3">UF</th>
                <th className="p-3 text-right">Esperado</th><th className="p-3 text-right">Recebido</th><th className="p-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {pedidos.length === 0 ? (
                <tr><td className="p-4 text-slate-400" colSpan={6}>Nenhum pedido no período.</td></tr>
              ) : pedidos.slice(0, 120).map((p, i) => {
                const esperado = n(p.valor_liquido) || n(p.valor_total);
                const recebido = p.recebido_em ? n(p.valor_recebido) : null;
                const diverg = recebido != null && Math.abs(recebido - esperado) > 0.5;
                return (
                  <tr key={i} className="border-t border-slate-800">
                    <td className="p-3 font-mono text-xs">{String(p.pedido_externo_id)}</td>
                    <td className="p-3 text-slate-300">{String(p.cliente_nome || "—")}</td>
                    <td className="p-3 text-slate-400">{String(p.uf || "—")}</td>
                    <td className="p-3 text-right">{brl(esperado)}</td>
                    <td className="p-3 text-right">{recebido != null ? brl(recebido) : "—"}</td>
                    <td className="p-3">
                      {recebido == null ? <Chip cor="info">A receber</Chip> : diverg ? <Chip cor="neg">Divergente</Chip> : <Chip cor="pos">Recebido</Chip>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Amostra dos {Math.min(120, pedidos.length)} pedidos mais recentes — o período inteiro tem{" "}
          <b>{int(n(con.total))}</b> pedidos, e os KPIs acima e as divergências abaixo já cobrem todos eles.
        </p>
      </section>

      {/* 2 — Divergências de recebimento */}
      <section>
        <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-bold">Divergências de recebimento</h2>
          <form action="/api/financas/divergencias/export" method="get" className="flex items-center gap-2">
            {lojas && lojas.length === 1 && <input type="hidden" name="loja" value={lojas[0]} />}
            <label className="text-xs text-slate-400">Mês:</label>
            <select
              name="mes"
              defaultValue={meses[0].v}
              className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
            >
              {meses.map((m) => (
                <option key={m.v} value={m.v}>{m.l}</option>
              ))}
            </select>
            <button
              type="submit"
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
            >
              ⬇ Exportar (CSV)
            </button>
          </form>
        </div>
        <p className="mb-3 text-xs text-slate-500">
          Pedidos que caíram na carteira com valor diferente do que o escrow prometeu, no período inteiro
          (maiores primeiro). Boa parte é afiliado/ajuste aplicado após a captura.
        </p>
        {divergencias.length === 0 ? (
          <p className="text-slate-400">Nenhuma divergência de recebimento no período. 🎉</p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-800 text-xs uppercase text-slate-400">
                <tr><th className="p-3">Pedido</th><th className="p-3">Cliente</th><th className="p-3 text-right">Esperado</th><th className="p-3 text-right">Recebido</th><th className="p-3 text-right">Diferença</th></tr>
              </thead>
              <tbody>
                {divergencias.slice(0, 100).map((p, i) => (
                  <tr key={i} className="border-t border-slate-800">
                    <td className="p-3 font-mono text-xs">{String(p.pedido_externo_id)}</td>
                    <td className="p-3 text-slate-300">{String(p.cliente_nome || "—")}</td>
                    <td className="p-3 text-right">{brl(n(p.esperado))}</td>
                    <td className="p-3 text-right">{brl(n(p.recebido))}</td>
                    <td className={`p-3 text-right ${n(p.dif) < 0 ? "text-red-300" : "text-emerald-300"}`}>
                      {n(p.dif) < 0 ? "− " : "+ "}{brl(Math.abs(n(p.dif)))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 3 — Auditoria de Taxas */}
      <section>
        <h2 className="mb-1 text-xl font-bold">Auditoria de Taxas</h2>
        <p className="mb-4 text-xs text-slate-500">
          Confere a taxa que a Shopee cobrou (comissão + serviço) contra a <b>esperada pela sua tabela</b>. Parte das
          divergências pode ser regra que a tabela não captura — use como sinal pra revisar/contestar os casos grandes.
        </p>
        <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4"><p className="text-xs text-slate-400">Taxa esperada</p><p className="mt-1 text-lg font-bold">{brl(n(aud.taxa_esperada_total))}</p></div>
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4"><p className="text-xs text-slate-400">Taxa cobrada</p><p className="mt-1 text-lg font-bold">{brl(n(aud.taxa_real_total))}</p></div>
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4"><p className="text-xs text-slate-400">Cobrado a mais</p><p className="mt-1 text-lg font-bold text-orange-300">{brl(n(aud.cobrado_a_mais))}</p></div>
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4"><p className="text-xs text-slate-400">Cobrado a menos</p><p className="mt-1 text-lg font-bold text-emerald-300">{brl(Math.abs(n(aud.cobrado_a_menos)))}</p></div>
        </div>
        <p className="mb-3 text-sm text-slate-300">Maiores diferenças (Shopee cobrou <b>a mais</b> que a sua tabela):</p>
        {audList.length === 0 ? (
          <p className="text-slate-400">Sem divergências relevantes de taxa no período. 🎉</p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-800 text-xs uppercase text-slate-400">
                <tr><th className="p-3">Pedido</th><th className="p-3">Cliente</th><th className="p-3 text-right">Venda</th><th className="p-3 text-right">Esperada</th><th className="p-3 text-right">Cobrada</th><th className="p-3 text-right">Diferença</th></tr>
              </thead>
              <tbody>
                {audList.map((a, i) => (
                  <tr key={i} className="border-t border-slate-800">
                    <td className="p-3 font-mono text-xs">{String(a.pedido_externo_id)}</td>
                    <td className="p-3 text-slate-300">{String(a.cliente_nome || "—")}</td>
                    <td className="p-3 text-right">{brl(n(a.valor_total))}</td>
                    <td className="p-3 text-right">{brl(n(a.taxa_esperada))}</td>
                    <td className="p-3 text-right">{brl(n(a.taxa_real))}</td>
                    <td className="p-3 text-right text-orange-300">+ {brl(n(a.taxa_diferenca))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

// (Divergências virou seção dentro de Conciliação — ver componente Conciliacao acima.)

// ---------------- CARTEIRA ----------------
async function Carteira({ lojas }: { lojas: string[] | null }) {
  const [{ data: saldosRaw }, { data: movRaw }, { data: saqueRaw }, { data: heatRaw }] = await Promise.all([
    supabase.rpc("carteira_saldos", { p_loja_ids: lojas }),
    supabase.rpc("carteira_movimento_dia", { p_loja_ids: lojas, p_dias: 60 }),
    supabase.rpc("carteira_saque_dia", { p_loja_ids: lojas, p_dias: 30 }),
    supabase.rpc("carteira_entrada_heatmap", { p_loja_ids: lojas, p_dias: 60 }),
  ]);
  const carteiras =
    (saldosRaw as { loja_id: string; nome: string; saldo: number; atualizado_em: string }[]) || [];
  const mov = (movRaw as { dow: number; entrou: number; saiu: number }[]) || [];
  const saques = (saqueRaw as { dow: number; saque_medio: number; pct: number; n_dias: number }[]) || [];
  const cells = (heatRaw as { dow: number; hora: number; total: number; qtd: number }[]) || [];
  const totalGeral = carteiras.reduce((s, c) => s + n(c.saldo), 0);

  const diasLbl: Record<number, string> = { 0: "Dom", 1: "Seg", 2: "Ter", 3: "Qua", 4: "Qui", 5: "Sex", 6: "Sáb" };
  const diasOrd = [1, 2, 3, 4, 5, 6, 0]; // segunda-primeiro

  // Movimento líquido por dia: entrou (valor>0) e saiu (|valor<0|).
  const entrouDia = new Array(7).fill(0);
  const saiuDia = new Array(7).fill(0);
  for (const m of mov) {
    entrouDia[m.dow] = n(m.entrou);
    saiuDia[m.dow] = Math.abs(n(m.saiu));
  }
  const maxAbs = Math.max(1, ...entrouDia, ...saiuDia);
  const temMov = mov.length > 0;

  // Saque por dia da semana: média por dia típico + % do total.
  const saquePorDia = new Array(7).fill(0);
  const saquePct = new Array(7).fill(0);
  let saqueTotal = 0;
  let diasTotal = 0;
  for (const s of saques) {
    saquePorDia[s.dow] = n(s.saque_medio);
    saquePct[s.dow] = n(s.pct);
    saqueTotal += n(s.saque_medio) * n(s.n_dias);
    diasTotal += n(s.n_dias);
  }
  const saqueMedioDia = diasTotal > 0 ? saqueTotal / diasTotal : 0;
  const maxSaque = Math.max(1, ...saquePorDia);
  const temSaque = saqueTotal > 0;

  // Horário em que as vendas caem (renda) por hora do dia.
  const perHour = new Array(24).fill(0);
  for (const c of cells) perHour[c.hora] += n(c.total);
  const maxHour = Math.max(1, ...perHour);
  const temHora = cells.length > 0;
  const horaPico = temHora ? perHour.indexOf(Math.max(...perHour)) : null;
  const horas = Array.from({ length: 24 }, (_, h) => h);

  return (
    <div>
      {/* Saldo por carteira (uma por loja) */}
      <div className="mb-8">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 className="text-xl font-bold">Saldo por carteira</h2>
          {carteiras.length > 1 && (
            <span className="text-sm text-slate-400">
              Total: <b className="text-emerald-300">{brl(totalGeral)}</b>
            </span>
          )}
        </div>
        {carteiras.length === 0 ? (
          <p className="text-slate-400">Sem carteira sincronizada ainda. Rode a sincronização da carteira.</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {carteiras.map((c) => (
              <div key={c.loja_id} className="rounded-2xl border border-emerald-800 bg-slate-900 p-5">
                <p className="text-sm text-slate-400">👛 {c.nome}</p>
                <p className="mt-1 text-3xl font-bold text-emerald-300">{brl(n(c.saldo))}</p>
                <p className="mt-1 text-xs text-slate-500">atualizado {dt(c.atualizado_em)}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Movimento líquido por dia da semana */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
        <h2 className="mb-1 text-xl font-bold">
          Movimento por dia da semana <span className="text-sm font-normal text-slate-500">· média por dia</span>
        </h2>
        <p className="mb-5 text-xs text-slate-500">
          Média de um dia típico (base: últimos 60 dias). Tudo que <span className="text-emerald-300">entrou</span>{" "}
          (vendas + antecipação) menos tudo que <span className="text-red-300">saiu</span> (saques/PIX + ads +
          reembolsos). A Shopee não credita vendas no fim de semana, então o acúmulo cai na <b>segunda</b>.
        </p>
        {!temMov ? (
          <p className="text-slate-400">Sem movimento no período. Rode a sincronização da carteira.</p>
        ) : (
          <div className="space-y-2">
            {diasOrd.map((d) => {
              const ent = entrouDia[d];
              const sai = saiuDia[d];
              const liq = ent - sai;
              return (
                <div key={d} className="flex items-center gap-3">
                  <span className="w-10 shrink-0 text-sm text-slate-400">{diasLbl[d]}</span>
                  <div className="flex flex-1 items-center">
                    <div className="flex w-1/2 justify-end">
                      <div
                        className="h-5 rounded-l-md bg-red-500/80"
                        style={{ width: `${(sai / maxAbs) * 100}%` }}
                        title={`Saiu: ${brl(sai)}`}
                      />
                    </div>
                    <div className="h-6 w-px bg-slate-600" />
                    <div className="flex w-1/2 justify-start">
                      <div
                        className="h-5 rounded-r-md bg-emerald-500/85"
                        style={{ width: `${(ent / maxAbs) * 100}%` }}
                        title={`Entrou: ${brl(ent)}`}
                      />
                    </div>
                  </div>
                  <span
                    className={`w-28 shrink-0 text-right text-sm tabular-nums ${liq >= 0 ? "text-emerald-300" : "text-red-300"}`}
                  >
                    {liq >= 0 ? "+ " : "− "}
                    {brl(Math.abs(liq))}
                  </span>
                </div>
              );
            })}
          </div>
        )}
        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
          <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-emerald-500/85" /> entrou</span>
          <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-red-500/80" /> saiu</span>
          <span>· o valor à direita é o líquido médio do dia</span>
        </div>
      </div>

      {/* Quanto você saca por dia da semana */}
      {temSaque && (
        <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <div className="mb-1 flex items-baseline justify-between gap-3">
            <h2 className="text-xl font-bold">Quanto você saca por dia</h2>
            <span className="text-sm text-slate-400">
              média <b className="text-red-300">{brl(saqueMedioDia)}</b>/dia
            </span>
          </div>
          <p className="mb-5 text-xs text-slate-500">
            Média do que sai pra sua conta (saque + PIX) em cada dia da semana, e o % do total de saques
            (base: últimos 30 dias).
          </p>
          <div className="space-y-2">
            {diasOrd.map((d) => (
              <div key={d} className="flex items-center gap-3">
                <span className="w-10 shrink-0 text-sm text-slate-400">{diasLbl[d]}</span>
                <div className="h-6 flex-1 overflow-hidden rounded-md bg-slate-800">
                  <div
                    className="flex h-full items-center justify-end rounded-md bg-red-500/75 pr-2"
                    style={{ width: `${saquePorDia[d] > 0 ? Math.max(8, (saquePorDia[d] / maxSaque) * 100) : 0}%` }}
                  >
                    {saquePct[d] > 0 && (
                      <span className="text-[11px] font-semibold text-white">{saquePct[d].toFixed(0)}%</span>
                    )}
                  </div>
                </div>
                <span className="w-28 shrink-0 text-right text-sm tabular-nums text-slate-200">
                  {brl(saquePorDia[d])}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Horário em que as vendas caem (por hora) */}
      {temHora && (
        <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <div className="mb-1 flex items-baseline justify-between gap-3">
            <h2 className="text-xl font-bold">Horário em que as vendas caem</h2>
            {horaPico != null && (
              <span className="text-sm text-slate-400">
                pico às <b className="text-emerald-300">{horaPico}h</b>
              </span>
            )}
          </div>
          <p className="mb-5 text-xs text-slate-500">Que horas a Shopee credita as vendas (renda), soma dos 60 dias.</p>
          <div className="overflow-x-auto">
            <div className="min-w-[560px]">
              <div className="flex h-28 items-end gap-[3px]">
                {horas.map((h) => (
                  <div
                    key={h}
                    title={`${h}h · ${brl(perHour[h])}`}
                    className="flex-1 rounded-t bg-emerald-500/80"
                    style={{ height: `${Math.max(2, (perHour[h] / maxHour) * 100)}%` }}
                  />
                ))}
              </div>
              <div className="mt-1 flex gap-[3px]">
                {horas.map((h) => (
                  <div key={h} className="flex-1 text-center text-[9px] text-slate-500">
                    {h % 3 === 0 ? h : ""}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------- ADS (nível loja) ----------------
async function Ads({ lojas }: { lojas: string[] | null }) {
  const { data } = await supabase.rpc("resumo_ads", { p_loja_ids: lojas, p_dias: 30 });
  const linhas = (Array.isArray(data) ? data : []) as {
    loja: string; gasto: number; gmv_direto: number; roas_direto: number;
    receita: number; tacos: number; ped_direto: number; cliques: number;
    impressoes: number; ctr: number;
  }[];

  const tot = linhas.reduce(
    (a, l) => ({
      gasto: a.gasto + n(l.gasto), gmv: a.gmv + n(l.gmv_direto),
      receita: a.receita + n(l.receita), ped: a.ped + n(l.ped_direto),
    }),
    { gasto: 0, gmv: 0, receita: 0, ped: 0 }
  );
  const roasTot = tot.gasto > 0 ? tot.gmv / tot.gasto : 0;
  const tacosTot = tot.receita > 0 ? (tot.gasto / tot.receita) * 100 : 0;

  return (
    <div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Gasto em Ads (30d)" val={brl(tot.gasto)} hint={`${linhas.length} loja(s)`} cor="text-orange-300" />
        <Kpi label="ROAS (direto)" val={`${roasTot.toFixed(1)}×`} hint="GMV de ads ÷ gasto" cor="text-emerald-300" />
        <Kpi label="TACOS" val={`${tacosTot.toFixed(1)}%`} hint="gasto ÷ receita total" cor="text-blue-300" />
        <Kpi label="Pedidos via Ads" val={String(tot.ped)} hint="atribuição direta" />
      </div>

      <div className="mt-6 overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-800 text-xs uppercase text-slate-400">
            <tr>
              <th className="p-3">Loja</th>
              <th className="p-3 text-right">Gasto</th>
              <th className="p-3 text-right">GMV (ads)</th>
              <th className="p-3 text-right">ROAS</th>
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
                <td className="p-3 text-right">{brl(n(l.gmv_direto))}</td>
                <td className="p-3 text-right text-emerald-300">{n(l.roas_direto).toFixed(1)}×</td>
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
        Últimos 30 dias · nível <b>loja</b>, direto da API de Ads da Shopee. <b>TACOS</b> = gasto ÷ receita total
        (quanto da venda o anúncio come). <b>ROAS</b> = retorno sobre o anúncio. A <b>Fase 2</b> (Raio-X por
        anúncio, com ROAS de equilíbrio na margem) vem com o coletor.
      </p>
    </div>
  );
}

// ---------------- CUSTO POR VARIAÇÃO ----------------
type VarRow = {
  loja_id: string; loja: string; item_sku: string; item_nome: string;
  model_sku: string; variacao: string | null; un: number;
  preco_med: number; custo: number | null; custo_item: number | null;
};
async function Variacoes({ lojas }: { lojas: string[] | null }) {
  const { data } = await supabase.rpc("variacoes_custo", { p_loja_ids: lojas });
  const rows = (Array.isArray(data) ? (data as VarRow[]) : []);
  const total = rows.length;
  const comProprio = rows.filter((r) => r.custo != null).length;

  // agrupa por produto (loja + item_sku)
  const grupos = new Map<string, { loja: string; item_sku: string; item_nome: string; un: number; vars: VarRow[] }>();
  for (const r of rows) {
    const k = r.loja_id + "|" + r.item_sku;
    let g = grupos.get(k);
    if (!g) { g = { loja: r.loja, item_sku: r.item_sku, item_nome: r.item_nome, un: 0, vars: [] }; grupos.set(k, g); }
    g.un += n(r.un);
    g.vars.push(r);
  }
  const lista = [...grupos.values()].sort((a, b) => b.un - a.un);
  let idx = 0;

  return (
    <div>
      <UploadCustos />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-400">
          💡 Cada <b>variação</b> com seu custo. Digite e aperte <b>Enter</b> pra pular pra próxima. Vazio = <b>herda o custo do item</b>.
        </p>
        <span className="text-sm text-slate-300">
          <b className="text-emerald-300">{comProprio}</b> / {total} variações com custo próprio
        </span>
      </div>

      {lista.length === 0 ? (
        <p className="rounded-2xl border border-slate-800 bg-slate-900 p-6 text-slate-400">
          Nenhuma variação com venda nos últimos 90 dias.
        </p>
      ) : (
        <div className="space-y-4">
          {lista.map((g) => (
            <div key={g.loja + g.item_sku} className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
              <div className="flex items-center justify-between gap-3 border-b border-slate-800 bg-slate-800/50 px-4 py-3">
                <div>
                  <span className="font-semibold text-white">{g.item_nome}</span>
                  <span className="ml-2 font-mono text-xs text-slate-400">{g.item_sku}</span>
                </div>
                <span className="whitespace-nowrap text-xs text-slate-400">{g.loja.replace(" Shopee", "")} · {int(g.un)} un</span>
              </div>
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-2">Variação</th>
                    <th className="px-4 py-2 text-right">Vend.</th>
                    <th className="px-4 py-2 text-right">Preço méd.</th>
                    <th className="px-4 py-2 text-right">Custo</th>
                    <th className="px-4 py-2 text-right">Margem</th>
                  </tr>
                </thead>
                <tbody>
                  {g.vars.map((v) => {
                    const custoEfetivo = v.custo != null ? n(v.custo) : v.custo_item != null ? n(v.custo_item) : null;
                    const preco = n(v.preco_med);
                    const margem = preco > 0 && custoEfetivo != null ? ((preco - custoEfetivo) / preco) * 100 : null;
                    const meu = idx++;
                    return (
                      <tr key={v.model_sku} className="border-t border-slate-800/70">
                        <td className="px-4 py-2">
                          <span className="text-slate-200">{v.variacao || "—"}</span>
                          <span className="ml-2 font-mono text-[11px] text-violet-300">{v.model_sku}</span>
                        </td>
                        <td className="px-4 py-2 text-right text-slate-400">{int(v.un)}</td>
                        <td className="px-4 py-2 text-right">{brl(preco)}</td>
                        <td className="px-4 py-2 text-right">
                          <CustoVariacaoInput lojaId={v.loja_id} modelSku={v.model_sku} inicial={v.custo != null ? n(v.custo) : null} idx={meu} />
                          {v.custo == null && v.custo_item != null && (
                            <span className="ml-2 text-[11px] text-orange-300">herda {brl(n(v.custo_item))}</span>
                          )}
                        </td>
                        <td className={`px-4 py-2 text-right ${margem == null ? "text-slate-500" : margem < 0 ? "text-red-300" : margem < 30 ? "text-orange-300" : "text-emerald-300"}`}>
                          {margem == null ? "—" : `${margem.toFixed(0)}%`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------- PRODUTOS & MARGEM ----------------
async function Produtos({ lojas }: { lojas: string[] | null }) {
  let q = supabase
    .from("produtos")
    .select("id, nome, sku, preco, custo")
    // sem custo primeiro (maior preço antes) — preenche o que falta e o que mais pesa
    .order("custo", { ascending: true, nullsFirst: true })
    .order("preco", { ascending: false })
    .limit(400);
  if (lojas) q = q.in("loja_id", lojas);
  const { data } = await q;
  const prods = (data as Record<string, unknown>[]) || [];
  const total = prods.length;
  const comCusto = prods.filter((p) => p.custo != null && n(p.custo) > 0).length;
  const faltando = total - comCusto;
  const pct = total > 0 ? Math.round((comCusto / total) * 100) : 0;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-400">
          💡 Digite o custo por unidade e aperte <b>Enter</b> pra pular pra próxima. A margem e o lucro recalculam.
        </p>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-slate-300">
            <b className="text-emerald-300">{comCusto}</b> / {total} com custo
            {faltando > 0 && <span className="text-orange-300"> · faltam {faltando}</span>}
          </span>
          <div className="h-2 w-32 overflow-hidden rounded-full bg-slate-800">
            <div className="h-full bg-emerald-500" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-800 text-xs uppercase text-slate-400">
            <tr><th className="p-3">SKU</th><th className="p-3">Produto</th><th className="p-3 text-right">Preço</th><th className="p-3 text-right">Custo</th><th className="p-3 text-right">Margem</th><th className="p-3">Situação</th></tr>
          </thead>
          <tbody>
            {prods.length === 0 ? (
              <tr><td className="p-4 text-slate-400" colSpan={6}>Nenhum produto. Sincronize os produtos primeiro.</td></tr>
            ) : prods.map((p, i) => {
              const preco = n(p.preco);
              const custo = p.custo != null ? n(p.custo) : null;
              const margem = preco > 0 && custo != null ? ((preco - custo) / preco) * 100 : null;
              return (
                <tr key={String(p.id)} className="border-t border-slate-800">
                  <td className="p-3 font-mono text-xs">{String(p.sku || "—")}</td>
                  <td className="p-3">{String(p.nome || "—")}</td>
                  <td className="p-3 text-right">{brl(preco)}</td>
                  <td className="p-3 text-right"><CustoInput produtoId={String(p.id)} inicial={custo} idx={i} /></td>
                  <td className={`p-3 text-right ${margem == null ? "text-slate-500" : margem < 0 ? "text-red-300" : margem < 15 ? "text-orange-300" : "text-emerald-300"}`}>
                    {margem == null ? "—" : `${margem.toFixed(0)}%`}
                  </td>
                  <td className="p-3">
                    {margem == null ? <span className="text-slate-500 text-xs">sem custo</span>
                      : margem < 0 ? <Chip cor="neg">Prejuízo</Chip>
                      : margem < 15 ? <Chip cor="warn">Atenção</Chip>
                      : <Chip cor="pos">Lucro</Chip>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------- IMPOSTOS ----------------
async function Impostos({ conta }: { conta: string | null }) {
  const { data } = await supabase
    .from("impostos")
    .select("competencia, valor")
    .eq("conta_id", conta ?? "")
    .order("competencia", { ascending: false })
    .limit(24);
  const lista = (data as { competencia: string; valor: number }[]) || [];
  const hoje = new Date();
  const compAtual = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
        <h2 className="text-xl font-bold">Lançar imposto pago</h2>
        <p className="mb-4 mt-1 text-sm text-slate-400">
          No fim do mês, lance o imposto que <b>de fato foi pago</b> — entra no Balanço do mês.
        </p>
        <ImpostoForm competenciaInicial={compAtual} />
      </div>
      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
        <h2 className="mb-4 text-xl font-bold">Lançados</h2>
        {lista.length === 0 ? (
          <p className="text-slate-400">Nenhum imposto lançado ainda.</p>
        ) : (
          <div className="divide-y divide-slate-800">
            {lista.map((im) => (
              <div key={im.competencia} className="flex justify-between py-3">
                <span>{im.competencia}</span>
                <span className="font-semibold">{brl(n(im.valor))}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------- PREVISÃO DE FLUXO DE CAIXA ----------------
async function Previsao({ lojas }: { lojas: string[] | null }) {
  const { data } = await supabase.rpc("previsao_fluxo_caixa", { p_loja_ids: lojas, p_dias: 30 });
  const r = (data as Record<string, unknown>) || {};
  const dias = (r.proximos_dias as { dia: string; valor: number; pedidos: number }[]) || [];
  const porUf = (r.por_uf as { uf: string; dias: number; amostra: number }[]) || [];
  const BR_UFS = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"];
  const ufMap = new Map(porUf.map((u) => [u.uf, u]));
  const ufComDados = [...porUf].filter((u) => u.uf !== "—").sort((a, b) => n(a.dias) - n(b.dias));
  const ufSemDados = BR_UFS.filter((uf) => !ufMap.has(uf));
  const maxV = Math.max(1, ...dias.map((d) => n(d.valor)));
  const lim7 = addDiasBRT(7);
  const prox7 = dias.filter((d) => d.dia < lim7).reduce((t, d) => t + n(d.valor), 0);

  return (
    <div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Kpi label="A receber (total)" val={brl(n(r.total_a_receber))} hint={`${n(r.qtd_a_receber)} pedido(s) em aberto`} cor="text-blue-300" />
        <Kpi label="Próximos 7 dias" val={brl(prox7)} hint="previsto cair na carteira" cor="text-emerald-300" />
        <Kpi label="Tempo médio" val={`${n(r.media_geral_dias)} dias`} hint={`90% cai em até ${n(r.p90_dias)}d · base ${int(n(r.base_amostra))}`} />
        <Kpi label="Atrasado" val={brl(n(r.atrasado_valor))} hint={`${int(n(r.atrasado_pedidos))} pedido(s) passaram de ${n(r.p90_dias)} dias sem cair`} cor="text-orange-300" />
      </div>

      <div className="mt-8 rounded-2xl border border-slate-800 bg-slate-900 p-6">
        <h2 className="mb-1 text-xl font-bold">Quanto entra por dia (próximos 30 dias)</h2>
        <p className="mb-5 text-xs text-slate-500">
          Estimativa: data do pedido + tempo médio até cair (por UF quando há amostra, senão a média geral).
        </p>
        {dias.length === 0 ? (
          <p className="text-slate-400">
            Ainda sem base pra prever. Assim que a carteira e a região terminarem de sincronizar, a previsão aparece.
          </p>
        ) : (
          <div className="space-y-2">
            {dias.map((d) => (
              <div key={d.dia} className="flex items-center gap-3">
                <span className="w-24 shrink-0 text-sm text-slate-400">{diaLabel(d.dia)}</span>
                <div className="h-6 flex-1 overflow-hidden rounded-md bg-slate-800">
                  <div
                    className="flex h-full items-center justify-end rounded-md bg-emerald-600 pr-2 text-xs font-semibold text-white"
                    style={{ width: `${Math.max(6, (n(d.valor) / maxV) * 100)}%` }}
                  >
                    {brl(n(d.valor))}
                  </div>
                </div>
                <span className="w-16 shrink-0 text-right text-xs text-slate-500">{n(d.pedidos)} ped.</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-900 p-6">
        <h2 className="mb-1 text-xl font-bold">Tempo de recebimento por estado</h2>
        <p className="mb-4 text-xs text-slate-500">
          Dias médios do pedido até o dinheiro cair, por UF (do mais rápido ao mais lento). Todos os 27 estados —
          os que ainda não têm amostra aparecem apagados.
        </p>
        {ufComDados.length > 0 && (
          <div className="mb-4 flex flex-wrap gap-2">
            {ufComDados.map((u) => (
              <span key={u.uf} className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm">
                <b>{u.uf}</b> · <span className="text-emerald-300">{u.dias}d</span>{" "}
                <span className="text-slate-500">({int(u.amostra)})</span>
              </span>
            ))}
          </div>
        )}
        {ufSemDados.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {ufSemDados.map((uf) => (
              <span key={uf} className="rounded-md border border-slate-800 px-2 py-1 text-xs text-slate-600">
                {uf}
              </span>
            ))}
          </div>
        )}
        <p className="mt-3 text-xs text-slate-500">
          Vai ficando mais preciso conforme a base de cada estado enche. Estados sem amostra usam a média geral na previsão.
        </p>
      </div>
    </div>
  );
}

// ---------------- UI helpers ----------------
function Kpi({ label, val, hint, cor }: { label: string; val: string; hint?: string; cor?: string }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
      <p className="text-sm text-slate-400">{label}</p>
      <p className={`mt-2 text-2xl font-bold ${cor || "text-white"}`}>{val}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}
function Chip({ cor, children }: { cor: "pos" | "neg" | "warn" | "info"; children: React.ReactNode }) {
  const m = {
    pos: "bg-emerald-900 text-emerald-300",
    neg: "bg-red-900 text-red-300",
    warn: "bg-amber-900 text-amber-300",
    info: "bg-blue-900 text-blue-300",
  } as const;
  return <span className={`rounded-full px-3 py-1 text-xs font-semibold ${m[cor]}`}>{children}</span>;
}
