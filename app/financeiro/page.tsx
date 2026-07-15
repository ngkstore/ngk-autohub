import { supabase } from "@/lib/supabase";
import { escopoDoUsuario, filtroLojas } from "@/lib/conta";

export const dynamic = "force-dynamic";

type FinanceiroPageProps = {
  searchParams: Promise<{ loja?: string; periodo?: string }>;
};

type ResumoFinanceiro = {
  pedidos: number;
  vendas: number;
  valor_pago: number;
  valor_liquido: number;
  taxa_comissao: number;
  taxa_servico: number;
  cupom_loja: number;
  cupom_shopee: number;
  frete: number;
  desconto_vendedor: number;
  pendentes_conciliacao: number;
};

function diaBRT(date: Date) {
  return date.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

function isoInicioBRT(ano: number, mes: number, dia: number) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${ano}-${p(mes)}-${p(dia)}T00:00:00-03:00`;
}

function getPeriodoFiltro(periodo?: string): { inicio: string; fim: string } | null {
  const [ano, mes, dia] = diaBRT(new Date()).split("-").map(Number);
  const base = new Date(Date.UTC(ano, mes - 1, dia));
  const isoDe = (d: Date) =>
    isoInicioBRT(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  const deslocar = (dias: number) => {
    const d = new Date(base);
    d.setUTCDate(d.getUTCDate() + dias);
    return isoDe(d);
  };
  const inicioHoje = isoInicioBRT(ano, mes, dia);
  const inicioAmanha = deslocar(1);

  switch (periodo) {
    case "hoje":
      return { inicio: inicioHoje, fim: inicioAmanha };
    case "ontem":
      return { inicio: deslocar(-1), fim: inicioHoje };
    case "7dias":
      return { inicio: deslocar(-7), fim: inicioAmanha };
    case "30dias":
      return { inicio: deslocar(-30), fim: inicioAmanha };
    case "mes":
      return { inicio: isoInicioBRT(ano, mes, 1), fim: inicioAmanha };
    case "ano":
      return { inicio: isoInicioBRT(ano, 1, 1), fim: inicioAmanha };
    default:
      return null;
  }
}

function num(v: number | string | null) {
  return Number(v || 0);
}

function moeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function dataHora(d: string) {
  return new Date(d).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
}

export default async function FinanceiroPage({ searchParams }: FinanceiroPageProps) {
  const params = await searchParams;
  const periodo = getPeriodoFiltro(params.periodo);
  const escopo = await escopoDoUsuario();
  const lojas = filtroLojas(escopo, params.loja);

  const { data: resumoRpc } = await supabase.rpc("resumo_financeiro", {
    p_loja_ids: lojas,
    p_inicio: periodo?.inicio ?? null,
    p_fim: periodo?.fim ?? null,
  });

  const r = (resumoRpc as ResumoFinanceiro | null) || {
    pedidos: 0,
    vendas: 0,
    valor_pago: 0,
    valor_liquido: 0,
    taxa_comissao: 0,
    taxa_servico: 0,
    cupom_loja: 0,
    cupom_shopee: 0,
    frete: 0,
    desconto_vendedor: 0,
    pendentes_conciliacao: 0,
  };

  const taxasTotais = num(r.taxa_comissao) + num(r.taxa_servico);
  const cuponsTotais = num(r.cupom_loja) + num(r.cupom_shopee);

  // Pedidos conciliados recentes
  let recentesQuery = supabase
    .from("pedidos")
    .select(
      "pedido_externo_id, cliente_nome, valor_total, taxa_comissao, taxa_servico, valor_liquido, data_pagamento"
    )
    .eq("marketplace", "shopee")
    .not("escrow_atualizado_em", "is", null)
    .order("data_pagamento", { ascending: false, nullsFirst: false })
    .limit(20);

  if (lojas) recentesQuery = recentesQuery.in("loja_id", lojas);
  if (periodo) {
    recentesQuery = recentesQuery
      .gte("data_pagamento", periodo.inicio)
      .lt("data_pagamento", periodo.fim);
  }
  const { data: recentes } = await recentesQuery;

  const semDados = !resumoRpc;

  return (
    <div className="p-8 text-white">
      <h1 className="text-4xl font-bold">Financeiro</h1>
      <p className="mt-2 text-slate-400">
        Conciliação real da Shopee: vendas, cupons, frete, taxas e o valor
        líquido a receber (dados do repasse/escrow).
      </p>

      {semDados && (
        <div className="mt-4 rounded-xl bg-yellow-900/40 px-4 py-3 text-sm text-yellow-200">
          A função SQL <code>resumo_financeiro</code> ainda não foi criada — rode
          o arquivo <code>supabase/resumo_financeiro.sql</code> no Supabase.
        </div>
      )}

      {/* Destaque */}
      <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-3">
        <div className="rounded-2xl border border-emerald-700 bg-slate-900 p-6">
          <p className="text-sm text-slate-400">Valor Líquido a Receber</p>
          <p className="mt-2 text-4xl font-bold text-emerald-300">
            {moeda(num(r.valor_liquido))}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {r.pedidos} pedido(s) conciliado(s)
          </p>
        </div>

        <div className="rounded-2xl bg-slate-900 p-6">
          <p className="text-sm text-slate-400">Vendas (mercadoria)</p>
          <p className="mt-2 text-4xl font-bold text-green-300">
            {moeda(num(r.vendas))}
          </p>
        </div>

        <div className="rounded-2xl bg-slate-900 p-6">
          <p className="text-sm text-slate-400">Valor Pago pelos Clientes</p>
          <p className="mt-2 text-4xl font-bold text-blue-300">
            {moeda(num(r.valor_pago))}
          </p>
        </div>
      </div>

      {/* Composição */}
      <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl bg-slate-900 p-6">
          <p className="text-sm text-slate-400">Taxas (comissão + serviço)</p>
          <p className="mt-2 text-3xl font-bold text-red-300">
            {moeda(taxasTotais)}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            comissão {moeda(num(r.taxa_comissao))} • serviço{" "}
            {moeda(num(r.taxa_servico))}
          </p>
        </div>

        <div className="rounded-2xl bg-slate-900 p-6">
          <p className="text-sm text-slate-400">Cupons (loja + Shopee)</p>
          <p className="mt-2 text-3xl font-bold text-orange-300">
            {moeda(cuponsTotais)}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            loja {moeda(num(r.cupom_loja))} • shopee {moeda(num(r.cupom_shopee))}
          </p>
        </div>

        <div className="rounded-2xl bg-slate-900 p-6">
          <p className="text-sm text-slate-400">Frete</p>
          <p className="mt-2 text-3xl font-bold text-slate-200">
            {moeda(num(r.frete))}
          </p>
        </div>

        <div className="rounded-2xl bg-slate-900 p-6">
          <p className="text-sm text-slate-400">Pendentes de conciliação</p>
          <p className="mt-2 text-3xl font-bold text-yellow-300">
            {r.pendentes_conciliacao}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            pedidos pagos ainda sem escrow
          </p>
        </div>
      </div>

      {/* Tabela */}
      <section className="mt-10 rounded-2xl bg-slate-900 p-6">
        <h2 className="text-2xl font-bold">Pedidos Conciliados Recentes</h2>
        <div className="mt-6 overflow-x-auto rounded-xl border border-slate-800">
          <table className="w-full text-left">
            <thead className="bg-slate-800 text-sm text-slate-300">
              <tr>
                <th className="p-4">Pedido</th>
                <th className="p-4">Cliente</th>
                <th className="p-4">Venda</th>
                <th className="p-4">Taxas</th>
                <th className="p-4">Líquido</th>
                <th className="p-4">Data</th>
              </tr>
            </thead>
            <tbody>
              {recentes && recentes.length > 0 ? (
                recentes.map((p, i) => (
                  <tr key={`${p.pedido_externo_id}-${i}`} className="border-t border-slate-800">
                    <td className="p-4 font-semibold">{p.pedido_externo_id}</td>
                    <td className="p-4 text-slate-300">{p.cliente_nome || "-"}</td>
                    <td className="p-4 text-green-300">{moeda(num(p.valor_total))}</td>
                    <td className="p-4 text-red-300">
                      {moeda(num(p.taxa_comissao) + num(p.taxa_servico))}
                    </td>
                    <td className="p-4 font-semibold text-emerald-300">
                      {moeda(num(p.valor_liquido))}
                    </td>
                    <td className="p-4 text-slate-400">
                      {p.data_pagamento ? dataHora(p.data_pagamento) : "-"}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="p-4 text-slate-400" colSpan={6}>
                    Nenhum pedido conciliado no período. Rode &quot;Conciliar
                    Financeiro&quot; na tela de Sincronização.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
