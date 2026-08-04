import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { escopoDoUsuario, filtroLojas } from "@/lib/conta";
import CustoInput from "../components/CustoInput";
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
function periodoFiltro(periodo: string): { inicio: string; fim: string } | null {
  const [a, m, d] = diaBRT(new Date()).split("-").map(Number);
  const base = new Date(Date.UTC(a, m - 1, d));
  const desloca = (dias: number) => {
    const x = new Date(base);
    x.setUTCDate(x.getUTCDate() + dias);
    return isoBRT(x.getUTCFullYear(), x.getUTCMonth() + 1, x.getUTCDate());
  };
  const amanha = desloca(1);
  switch (periodo) {
    case "7dias": return { inicio: desloca(-7), fim: amanha };
    case "30dias": return { inicio: desloca(-30), fim: amanha };
    case "mes": return { inicio: isoBRT(a, m, 1), fim: amanha };
    case "180dias": return { inicio: desloca(-180), fim: amanha };
    default: return { inicio: isoBRT(a, m, 1), fim: amanha };
  }
}
const PERIODOS = [
  { k: "mes", r: "Este mês" },
  { k: "30dias", r: "30 dias" },
  { k: "7dias", r: "7 dias" },
  { k: "180dias", r: "6 meses" },
];

const ABAS = [
  { k: "balanco", r: "📊 Balanço" },
  { k: "conciliacao", r: "🧮 Conciliação" },
  { k: "previsao", r: "📅 Previsão" },
  { k: "divergencias", r: "⚠️ Divergências" },
  { k: "carteira", r: "👛 Carteira" },
  { k: "produtos", r: "🏷️ Produtos & Margem" },
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
function dt(s?: string | null) {
  return s ? new Date(s).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";
}

export default async function FinancasPage({ searchParams }: Props) {
  const params = await searchParams;
  const aba = params.aba || "balanco";
  const periodoK = params.periodo || "mes";
  const escopo = await escopoDoUsuario();
  const lojas = filtroLojas(escopo, params.loja); // string[] | null
  const periodo = periodoFiltro(periodoK);

  const linkAba = (k: string) =>
    `/financas?aba=${k}&periodo=${periodoK}${params.loja ? `&loja=${params.loja}` : ""}`;
  const linkPer = (k: string) =>
    `/financas?aba=${aba}&periodo=${k}${params.loja ? `&loja=${params.loja}` : ""}`;

  return (
    <div className="p-8 text-white">
      <h1 className="text-4xl font-bold">💰 Finanças</h1>
      <p className="mt-2 text-slate-400">
        Tudo do dinheiro num lugar só — do pedido ao resultado, por loja.
      </p>

      {/* período */}
      <div className="mt-5 flex flex-wrap gap-2">
        {PERIODOS.map((p) => (
          <Link
            key={p.k}
            href={linkPer(p.k)}
            className={`rounded-full px-4 py-2 text-sm font-semibold ${
              p.k === periodoK ? "bg-emerald-600 text-white" : "bg-slate-800 text-slate-300 hover:bg-slate-700"
            }`}
          >
            {p.r}
          </Link>
        ))}
      </div>

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
        {aba === "conciliacao" && <Conciliacao lojas={lojas} periodo={periodo} />}
        {aba === "previsao" && <Previsao lojas={lojas} />}
        {aba === "divergencias" && <Divergencias lojas={lojas} periodo={periodo} />}
        {aba === "carteira" && <Carteira lojas={lojas} />}
        {aba === "produtos" && <Produtos lojas={lojas} />}
        {aba === "impostos" && <Impostos conta={escopo.contaId} />}
      </div>
    </div>
  );
}

type Periodo = { inicio: string; fim: string } | null;

// ---------------- BALANÇO (DRE) ----------------
async function Balanco({ lojas, periodo, conta }: { lojas: string[] | null; periodo: Periodo; conta: string | null }) {
  const { data } = await supabase.rpc("resumo_financas", {
    p_loja_ids: lojas,
    p_inicio: periodo?.inicio ?? null,
    p_fim: periodo?.fim ?? null,
    p_conta: conta,
  });
  const r = (data as Record<string, unknown>) || {};
  const receita = n(r.receita_bruta);
  const taxas = Math.abs(n(r.taxas));
  const cupom = Math.abs(n(r.cupom_proprio)); // cupom_loja vem negativo no banco
  const afiliado = Math.abs(n(r.afiliado)); // custo opcional, já dentro do escrow
  const liquida = n(r.receita_liquida);
  const ads = n(r.ads);
  const reemb = n(r.reembolsos);
  const imposto = n(r.imposto);
  const resultado = liquida - ads - reemb - imposto;
  const margem = receita > 0 ? (resultado / receita) * 100 : 0;

  const linhas = [
    { l: "Receita (pedidos pagos)", v: receita, tot: false },
    { l: "(−) Taxas Shopee (comissão + serviço)", v: -taxas, tot: false },
    { l: "(−) Comissão de afiliado (opcional)", v: -afiliado, tot: false },
    { l: "(−) Cupom próprio (Shopee não entra)", v: -cupom, tot: false },
    { l: "= Receita líquida (escrow)", v: liquida, tot: true },
    { l: "(−) Ads (saída da carteira)", v: -ads, tot: false },
    { l: "(−) Reembolsos / devoluções", v: -reemb, tot: false },
    { l: "(−) Imposto lançado", v: -imposto, tot: false },
    { l: "= Resultado (antes do custo)", v: resultado, tot: true },
  ];

  return (
    <div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Kpi label="Recebido" val={brl(n(r.recebido))} hint={`${n(r.qtd_recebido)} pedido(s)`} cor="text-emerald-300" />
        <Kpi label="Falta receber" val={brl(n(r.a_receber))} hint={`${n(r.qtd_a_receber)} pedido(s)`} cor="text-blue-300" />
        <Kpi label="Resultado" val={brl(resultado)} hint="antes do custo" />
        <Kpi label="Margem" val={`${margem.toFixed(1)}%`} hint="antes do custo" />
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
          O <b>custo da mercadoria</b> entra no resultado quando você cadastra os custos na aba Produtos &amp; Margem.
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

// ---------------- CONCILIAÇÃO ----------------
async function Conciliacao({ lojas, periodo }: { lojas: string[] | null; periodo: Periodo }) {
  let q = supabase
    .from("pedidos")
    .select("pedido_externo_id, cliente_nome, valor_total, valor_liquido, valor_recebido, recebido_em, cupom_loja, status, uf")
    .eq("marketplace", "shopee")
    .eq("pedido_efetivado", true)
    .order("data_pedido", { ascending: false })
    .limit(150);
  if (lojas) q = q.in("loja_id", lojas);
  if (periodo) q = q.gte("data_pedido", periodo.inicio).lt("data_pedido", periodo.fim);
  const { data } = await q;
  const pedidos = (data as Record<string, unknown>[]) || [];

  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-800 text-xs uppercase text-slate-400">
          <tr>
            <th className="p-3">Pedido</th><th className="p-3">Cliente</th><th className="p-3">UF</th>
            <th className="p-3 text-right">Esperado</th><th className="p-3 text-right">Recebido</th>
            <th className="p-3 text-right">Cupom próprio</th><th className="p-3">Status</th>
          </tr>
        </thead>
        <tbody>
          {pedidos.length === 0 ? (
            <tr><td className="p-4 text-slate-400" colSpan={7}>Nenhum pedido no período. (A coluna "Recebido" aparece após sincronizar a carteira.)</td></tr>
          ) : pedidos.map((p, i) => {
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
                <td className="p-3 text-right">{n(p.cupom_loja) > 0 ? brl(n(p.cupom_loja)) : "—"}</td>
                <td className="p-3">
                  {recebido == null ? <Chip cor="info">A receber</Chip>
                    : diverg ? <Chip cor="neg">Divergente</Chip>
                    : <Chip cor="pos">Recebido</Chip>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ---------------- DIVERGÊNCIAS ----------------
async function Divergencias({ lojas, periodo }: { lojas: string[] | null; periodo: Periodo }) {
  let q = supabase
    .from("pedidos")
    .select("pedido_externo_id, cliente_nome, valor_total, valor_liquido, valor_recebido, recebido_em")
    .eq("marketplace", "shopee")
    .eq("pedido_efetivado", true)
    .not("recebido_em", "is", null)
    .order("data_pedido", { ascending: false })
    .limit(500);
  if (lojas) q = q.in("loja_id", lojas);
  if (periodo) q = q.gte("data_pedido", periodo.inicio).lt("data_pedido", periodo.fim);
  const { data } = await q;
  const pedidos = ((data as Record<string, unknown>[]) || []).filter((p) => {
    const esperado = n(p.valor_liquido) || n(p.valor_total);
    return Math.abs(n(p.valor_recebido) - esperado) > 0.5;
  });

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-slate-300">
          {pedidos.length === 0
            ? "Nenhuma divergência no período. 🎉"
            : `${pedidos.length} pedido(s) receberam valor diferente do esperado.`}
        </p>
        <a
          href={`/api/financas/divergencias/export${lojas ? `?loja=${lojas[0]}` : ""}`}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
        >
          ⬇ Exportar (CSV)
        </a>
      </div>
      {pedidos.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-800 text-xs uppercase text-slate-400">
              <tr><th className="p-3">Pedido</th><th className="p-3">Cliente</th><th className="p-3 text-right">Esperado</th><th className="p-3 text-right">Recebido</th><th className="p-3 text-right">Diferença</th></tr>
            </thead>
            <tbody>
              {pedidos.map((p, i) => {
                const esperado = n(p.valor_liquido) || n(p.valor_total);
                const dif = n(p.valor_recebido) - esperado;
                return (
                  <tr key={i} className="border-t border-slate-800">
                    <td className="p-3 font-mono text-xs">{String(p.pedido_externo_id)}</td>
                    <td className="p-3 text-slate-300">{String(p.cliente_nome || "—")}</td>
                    <td className="p-3 text-right">{brl(esperado)}</td>
                    <td className="p-3 text-right">{brl(n(p.valor_recebido))}</td>
                    <td className="p-3 text-right text-red-300">− {brl(Math.abs(dif))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------------- CARTEIRA ----------------
async function Carteira({ lojas }: { lojas: string[] | null }) {
  let q = supabase
    .from("carteira_transacoes")
    .select("criado_em, descricao, order_sn, categoria, valor, saldo, money_flow")
    .order("criado_em", { ascending: false })
    .limit(60);
  if (lojas) q = q.in("loja_id", lojas);
  const { data } = await q;
  const txs = (data as Record<string, unknown>[]) || [];
  const saldo = txs.length > 0 ? n(txs[0].saldo) : null;

  return (
    <div>
      {saldo != null && (
        <div className="mb-6 inline-block rounded-2xl border border-emerald-700 bg-slate-900 p-6">
          <p className="text-sm text-slate-400">Saldo atual da carteira</p>
          <p className="mt-1 text-3xl font-bold text-emerald-300">{brl(saldo)}</p>
        </div>
      )}
      <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-800 text-xs uppercase text-slate-400">
            <tr><th className="p-3">Data</th><th className="p-3">Descrição</th><th className="p-3">Pedido</th><th className="p-3">Tipo</th><th className="p-3 text-right">Valor</th><th className="p-3 text-right">Saldo</th></tr>
          </thead>
          <tbody>
            {txs.length === 0 ? (
              <tr><td className="p-4 text-slate-400" colSpan={6}>Sem movimentos ainda. Rode a sincronização da carteira.</td></tr>
            ) : txs.map((t, i) => (
              <tr key={i} className="border-t border-slate-800">
                <td className="p-3 text-slate-400">{dt(t.criado_em as string)}</td>
                <td className="p-3 text-slate-300">{String(t.descricao || "—")}</td>
                <td className="p-3 font-mono text-xs">{String(t.order_sn || "—")}</td>
                <td className="p-3"><span className="text-slate-400">{String(t.categoria)}</span></td>
                <td className={`p-3 text-right ${n(t.valor) < 0 ? "text-red-300" : "text-emerald-300"}`}>
                  {n(t.valor) < 0 ? `− ${brl(Math.abs(n(t.valor)))}` : `+ ${brl(n(t.valor))}`}
                </td>
                <td className="p-3 text-right">{brl(n(t.saldo))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------- PRODUTOS & MARGEM ----------------
async function Produtos({ lojas }: { lojas: string[] | null }) {
  let q = supabase
    .from("produtos")
    .select("id, nome, sku, preco, custo")
    .order("nome", { ascending: true })
    .limit(300);
  if (lojas) q = q.in("loja_id", lojas);
  const { data } = await q;
  const prods = (data as Record<string, unknown>[]) || [];

  return (
    <div>
      <p className="mb-3 text-sm text-slate-400">
        💡 O <b>custo é editável aqui</b> — digite o custo total por unidade e a margem recalcula.
      </p>
      <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-800 text-xs uppercase text-slate-400">
            <tr><th className="p-3">SKU</th><th className="p-3">Produto</th><th className="p-3 text-right">Preço</th><th className="p-3 text-right">Custo</th><th className="p-3 text-right">Margem</th><th className="p-3">Situação</th></tr>
          </thead>
          <tbody>
            {prods.length === 0 ? (
              <tr><td className="p-4 text-slate-400" colSpan={6}>Nenhum produto. Sincronize os produtos primeiro.</td></tr>
            ) : prods.map((p) => {
              const preco = n(p.preco);
              const custo = p.custo != null ? n(p.custo) : null;
              const margem = preco > 0 && custo != null ? ((preco - custo) / preco) * 100 : null;
              return (
                <tr key={String(p.id)} className="border-t border-slate-800">
                  <td className="p-3 font-mono text-xs">{String(p.sku || "—")}</td>
                  <td className="p-3">{String(p.nome || "—")}</td>
                  <td className="p-3 text-right">{brl(preco)}</td>
                  <td className="p-3 text-right"><CustoInput produtoId={String(p.id)} inicial={custo} /></td>
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
  const maxV = Math.max(1, ...dias.map((d) => n(d.valor)));
  const lim7 = addDiasBRT(7);
  const prox7 = dias.filter((d) => d.dia < lim7).reduce((t, d) => t + n(d.valor), 0);

  return (
    <div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Kpi label="A receber (total)" val={brl(n(r.total_a_receber))} hint={`${n(r.qtd_a_receber)} pedido(s) em aberto`} cor="text-blue-300" />
        <Kpi label="Próximos 7 dias" val={brl(prox7)} hint="previsto cair na carteira" cor="text-emerald-300" />
        <Kpi label="Tempo médio" val={`${n(r.media_geral_dias)} dias`} hint={`base: ${n(r.base_amostra)} pedidos já recebidos`} />
        <Kpi label="Atrasado" val={brl(n(r.atrasado_valor))} hint={`${n(r.atrasado_pedidos)} pedido(s) passaram da média`} cor="text-orange-300" />
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

      {porUf.length > 0 && (
        <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="mb-4 text-xl font-bold">Tempo médio de recebimento por região</h2>
          <div className="flex flex-wrap gap-2">
            {porUf.map((u) => (
              <span key={u.uf} className="rounded-lg bg-slate-800 px-3 py-2 text-sm">
                <b>{u.uf}</b> · {u.dias} dias <span className="text-slate-500">({u.amostra} amostra)</span>
              </span>
            ))}
          </div>
          <p className="mt-3 text-xs text-slate-500">Vai ficando mais preciso conforme a base de região enche.</p>
        </div>
      )}
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
