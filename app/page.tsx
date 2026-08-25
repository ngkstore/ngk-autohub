import { supabase } from "@/lib/supabase";
import DashboardCharts from "./components/DashboardCharts";
import GerarRankingButton from "./components/GerarRankingButton";
import { escopoDoUsuario, filtroLojas } from "@/lib/conta";

export const dynamic = "force-dynamic";

type DashboardProps = {
  searchParams: Promise<{
    loja?: string;
    periodo?: string;
  }>;
};

type PedidoRow = {
  valor_total: number | string | null;
  data_pedido: string | null;
  marketplace: string | null;
  status: string | null;
  pedido_efetivado: boolean | null;
  entra_faturamento: boolean | null;
  pedido_externo_id: string | null;
  cliente_nome: string | null;
};

// Formato retornado pela função SQL resumo_pedidos (cálculo no banco).
type ResumoPedidos = {
  total_pedidos: number;
  pedidos_efetivados: number;
  pedidos_faturados: number;
  pedidos_cancelados: number;
  faturamento_geral: number;
  faturamento_efetivado: number;
  faturamento_concluido: number;
  por_status: { status: string; quantidade: number }[];
  por_marketplace: { marketplace: string; faturamento: number }[];
  vendas_por_dia: { dia: string; faturamento: number }[];
};

// Tradução dos status da Shopee para exibição.
const statusLabels: Record<string, string> = {
  UNPAID: "Não pago",
  READY_TO_SHIP: "Pronto p/ envio",
  PROCESSED: "Processado",
  SHIPPED: "Enviado",
  TO_CONFIRM_RECEIVE: "A confirmar",
  COMPLETED: "Concluído",
  IN_CANCEL: "Em cancelamento",
  CANCELLED: "Cancelado",
  INVOICE_PENDING: "Aguardando NF",
  UNKNOWN: "Desconhecido",
};

function rotuloStatus(status?: string | null) {
  if (!status) return "Sem status";
  return statusLabels[status] || status;
}

// Data (YYYY-MM-DD) no fuso de Brasília.
function diaBRT(date: Date) {
  return date.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

// Início do dia em Brasília como instante absoluto (Brasil usa UTC-3 fixo).
function isoInicioBRT(ano: number, mes: number, dia: number) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${ano}-${p(mes)}-${p(dia)}T00:00:00-03:00`;
}

// Retorna o intervalo [inicio, fim) em Brasília. fim é exclusivo (use < fim),
// para "ontem" não pegar hoje, "este mês" não pegar o mês seguinte, etc.
function getPeriodoFiltro(
  periodo?: string
): { inicio: string; fim: string } | null {
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
  const inicioAmanha = deslocar(1); // fim padrão (exclusivo) para períodos até hoje

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

    case "todos":
      return null; // all-time (explícito — pode ser mais lento)

    default:
      // Padrão do dashboard: últimos 30 dias (evita a varredura all-time no load).
      return { inicio: deslocar(-30), fim: inicioAmanha };
  }
}

function formatarMoeda(valor: number) {
  return valor.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function formatarDataHora(data: string) {
  return new Date(data).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function num(valor: number | string | null) {
  return Number(valor || 0);
}

function formatarDiaCurto(dia: string) {
  const [, mes, d] = dia.split("-");
  return `${d}/${mes}`;
}

// Fallback (só usado se a função SQL ainda não existir): pagina os pedidos
// para somar tudo no app, contornando o limite de 1000 linhas do Supabase.
type Periodo = { inicio: string; fim: string } | null;

async function buscarTodosPedidos(
  lojaIds: string[] | null,
  periodo: Periodo
): Promise<PedidoRow[]> {
  const pageSize = 1000;
  const maxPaginas = 200; // trava de segurança
  const todos: PedidoRow[] = [];

  for (let pagina = 0; pagina < maxPaginas; pagina++) {
    const de = pagina * pageSize;

    let query = supabase
      .from("pedidos")
      .select(
        "valor_total, data_pedido, marketplace, status, pedido_efetivado, entra_faturamento, pedido_externo_id, cliente_nome"
      )
      .order("data_pedido", { ascending: false, nullsFirst: false })
      .range(de, de + pageSize - 1);

    if (lojaIds) query = query.in("loja_id", lojaIds);
    if (periodo) {
      query = query
        .gte("data_pedido", periodo.inicio)
        .lt("data_pedido", periodo.fim);
    }

    const { data, error } = await query;

    if (error || !data || data.length === 0) break;

    todos.push(...(data as PedidoRow[]));

    if (data.length < pageSize) break;
  }

  return todos;
}

type ResumoCalculado = {
  totalPedidos: number;
  efetivadosCount: number;
  faturadosCount: number;
  canceladosCount: number;
  faturamentoGeral: number;
  faturamentoEfetivado: number;
  faturamentoConcluido: number;
  vendasPorPeriodo: { data: string; faturamento: number }[];
  faturamentoPorMarketplace: { marketplace: string; faturamento: number }[];
  pedidosPorStatus: { status: string; quantidade: number }[];
};

// Calcula o resumo: tenta a função SQL (rápida e ilimitada) e, se ela ainda
// não existir, cai no fallback paginado no app.
async function calcularResumoPedidos(
  lojaIds: string[] | null,
  periodo: Periodo
): Promise<ResumoCalculado> {
  const { data: resumoRpc } = await supabase.rpc("resumo_pedidos", {
    p_loja_ids: lojaIds,
    p_inicio: periodo?.inicio ?? null,
    p_fim: periodo?.fim ?? null,
  });

  const resumo = resumoRpc as ResumoPedidos | null;

  if (resumo) {
    return {
      totalPedidos: num(resumo.total_pedidos),
      efetivadosCount: num(resumo.pedidos_efetivados),
      faturadosCount: num(resumo.pedidos_faturados),
      canceladosCount: num(resumo.pedidos_cancelados),
      faturamentoGeral: num(resumo.faturamento_geral),
      faturamentoEfetivado: num(resumo.faturamento_efetivado),
      faturamentoConcluido: num(resumo.faturamento_concluido),
      vendasPorPeriodo: (resumo.vendas_por_dia || []).map((v) => ({
        data: formatarDiaCurto(v.dia),
        faturamento: num(v.faturamento),
      })),
      faturamentoPorMarketplace: (resumo.por_marketplace || []).map((m) => ({
        marketplace: m.marketplace || "sem marketplace",
        faturamento: num(m.faturamento),
      })),
      pedidosPorStatus: (resumo.por_status || []).map((s) => ({
        status: rotuloStatus(s.status),
        quantidade: num(s.quantidade),
      })),
    };
  }

  // RPC indisponível/timeout (ex.: período "Todos" muito grande): retorna zeros.
  // NÃO paginamos os pedidos no app (isso puxava 65k linhas e saturava o banco).
  // O usuário deve escolher um período menor.
  return {
    totalPedidos: 0,
    efetivadosCount: 0,
    faturadosCount: 0,
    canceladosCount: 0,
    faturamentoGeral: 0,
    faturamentoEfetivado: 0,
    faturamentoConcluido: 0,
    vendasPorPeriodo: [],
    faturamentoPorMarketplace: [],
    pedidosPorStatus: [],
  };
}

export default async function Dashboard({ searchParams }: DashboardProps) {
  const params = await searchParams;

  const periodo = getPeriodoFiltro(params.periodo);
  const escopo = await escopoDoUsuario();
  const lojas = filtroLojas(escopo, params.loja);

  let avaliacoesQuery = supabase
    .from("avaliacoes")
    .select("*", { count: "exact", head: true });

  let ultimasQuery = supabase
    .from("avaliacoes")
    .select("*")
    .order("criado_em", { ascending: false })
    .limit(5);

  let produtosSemEstoqueQuery = supabase
    .from("produtos")
    .select("*", { count: "exact", head: true })
    .lte("estoque", 0);

  let financeiroQuery = supabase
    .from("financeiro")
    .select("tipo, valor, data_movimento");

  let rankingQuery = supabase
    .from("ranking_produtos")
    .select("*, produtos(nome, sku), lojas(apelido)")
    .order("faturamento", { ascending: false })
    .limit(10);

  // Pedidos efetivados recentes (query leve com limite — sem problema de 1000).
  let recentesQuery = supabase
    .from("pedidos")
    .select(
      "valor_total, marketplace, status, pedido_externo_id, cliente_nome, data_pedido"
    )
    .eq("pedido_efetivado", true)
    .not("data_pedido", "is", null)
    .order("data_pedido", { ascending: false })
    .limit(20);

  if (lojas) {
    avaliacoesQuery = avaliacoesQuery.in("loja_id", lojas);
    ultimasQuery = ultimasQuery.in("loja_id", lojas);
    produtosSemEstoqueQuery = produtosSemEstoqueQuery.in("loja_id", lojas);
    financeiroQuery = financeiroQuery.in("loja_id", lojas);
    rankingQuery = rankingQuery.in("loja_id", lojas);
    recentesQuery = recentesQuery.in("loja_id", lojas);
  }

  if (periodo) {
    avaliacoesQuery = avaliacoesQuery
      .gte("criado_em", periodo.inicio)
      .lt("criado_em", periodo.fim);
    ultimasQuery = ultimasQuery
      .gte("criado_em", periodo.inicio)
      .lt("criado_em", periodo.fim);
    produtosSemEstoqueQuery = produtosSemEstoqueQuery
      .gte("criado_em", periodo.inicio)
      .lt("criado_em", periodo.fim);
    financeiroQuery = financeiroQuery
      .gte("data_movimento", periodo.inicio)
      .lt("data_movimento", periodo.fim);
    recentesQuery = recentesQuery
      .gte("data_pedido", periodo.inicio)
      .lt("data_pedido", periodo.fim);
  }

  let respostasQuery = supabase
    .from("respostas_ia")
    .select("*, avaliacoes!inner(loja_id, criado_em)", {
      count: "exact",
      head: true,
    });
  if (lojas) {
    respostasQuery = respostasQuery.in("avaliacoes.loja_id", lojas);
  }
  if (periodo) {
    respostasQuery = respostasQuery
      .gte("avaliacoes.criado_em", periodo.inicio)
      .lt("avaliacoes.criado_em", periodo.fim);
  }

  const lojaScope =
    escopo.lojaIds.length > 0 ? escopo.lojaIds : ["00000000-0000-0000-0000-000000000000"];

  // Tudo em PARALELO (antes era uma query após a outra -> load lento).
  const [
    resumo,
    { count: totalAvaliacoes },
    { data: resumoAvalData },
    { data: ultimasAvaliacoes },
    { count: produtosSemEstoque },
    { data: financeiro },
    { data: rankingProdutos },
    { data: efetivadosRecentesData },
    { count: totalRespostas },
    { count: totalLojas },
    { count: lojasAtivas },
  ] = await Promise.all([
    calcularResumoPedidos(lojas, periodo),
    avaliacoesQuery,
    supabase.rpc("resumo_avaliacoes", {
      p_loja_ids: lojas,
      p_inicio: periodo?.inicio ?? null,
      p_fim: periodo?.fim ?? null,
    }),
    ultimasQuery,
    produtosSemEstoqueQuery,
    financeiroQuery,
    rankingQuery,
    recentesQuery,
    respostasQuery,
    supabase.from("lojas").select("*", { count: "exact", head: true }).in("id", lojaScope),
    supabase
      .from("lojas")
      .select("*", { count: "exact", head: true })
      .in("id", lojaScope)
      .in("status", ["ativo", "ativa"]),
  ]);

  const resumoAval = (resumoAvalData as {
    total: number; media: number; n1: number; n2: number; n3: number; n4: number; n5: number;
  } | null) || { total: 0, media: 0, n1: 0, n2: 0, n3: 0, n4: 0, n5: 0 };
  const efetivadosRecentes = (efetivadosRecentesData as PedidoRow[]) || [];

  const ticketMedio =
    resumo.efetivadosCount > 0
      ? resumo.faturamentoEfetivado / resumo.efetivadosCount
      : 0;

  const taxaEfetivacao =
    resumo.totalPedidos > 0
      ? Math.round((resumo.efetivadosCount / resumo.totalPedidos) * 100)
      : 0;

  const totalReceitas =
    financeiro
      ?.filter((item) => item.tipo === "receita")
      .reduce((total, item) => total + Number(item.valor || 0), 0) || 0;

  const totalDespesas =
    financeiro
      ?.filter((item) => item.tipo === "despesa")
      .reduce((total, item) => total + Number(item.valor || 0), 0) || 0;

  const lucroEstimado = totalReceitas - totalDespesas;

  const notaMedia = Number(resumoAval.media || 0).toFixed(1);

  const taxaAutomacao = totalAvaliacoes
    ? Math.round(((totalRespostas ?? 0) / totalAvaliacoes) * 100)
    : 0;

  const financeiroResumo = [
    { nome: "Receitas", valor: totalReceitas },
    { nome: "Despesas", valor: totalDespesas },
    { nome: "Lucro", valor: lucroEstimado },
  ];

  const avaliacoesPorNota = [1, 2, 3, 4, 5].map((nota) => ({
    nota: `${nota} estrela${nota > 1 ? "s" : ""}`,
    quantidade: Number(
      resumoAval[`n${nota}` as "n1" | "n2" | "n3" | "n4" | "n5"] || 0
    ),
  }));

  return (
    <div className="p-8 text-white">
      <h1 className="text-4xl font-bold">Dashboard</h1>

      <p className="mt-2 text-slate-400">
        Visão geral das operações. Use o seletor de loja no topo para filtrar.
      </p>

      {/* Destaque: faturamento */}
      <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-3">
        <div className="rounded-2xl border border-emerald-700 bg-slate-900 p-6">
          <p className="text-sm text-slate-400">
            Faturamento Efetivado (vendas reais)
          </p>
          <p className="mt-2 text-4xl font-bold text-emerald-300">
            {formatarMoeda(resumo.faturamentoEfetivado)}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {resumo.efetivadosCount} pedido(s) efetivado(s)
          </p>
        </div>

        <div className="rounded-2xl bg-slate-900 p-6">
          <p className="text-sm text-slate-400">Faturamento Geral (todos)</p>
          <p className="mt-2 text-4xl font-bold text-green-300">
            {formatarMoeda(resumo.faturamentoGeral)}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            inclui pendentes e cancelados
          </p>
        </div>

        <div className="rounded-2xl bg-slate-900 p-6">
          <p className="text-sm text-slate-400">Faturamento Concluído</p>
          <p className="mt-2 text-4xl font-bold text-teal-300">
            {formatarMoeda(resumo.faturamentoConcluido)}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {resumo.faturadosCount} pedido(s) concluído(s)/a confirmar
          </p>
        </div>
      </div>

      {/* KPIs */}
      <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl bg-slate-900 p-6">
          <p className="text-sm text-slate-400">Total de Pedidos</p>
          <p className="mt-2 text-4xl font-bold">{resumo.totalPedidos}</p>
        </div>

        <div className="rounded-2xl bg-slate-900 p-6">
          <p className="text-sm text-slate-400">Pedidos Efetivados</p>
          <p className="mt-2 text-4xl font-bold text-emerald-300">
            {resumo.efetivadosCount}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {taxaEfetivacao}% do total
          </p>
        </div>

        <div className="rounded-2xl bg-slate-900 p-6">
          <p className="text-sm text-slate-400">Cancelados / Não Efetivados</p>
          <p className="mt-2 text-4xl font-bold text-red-300">
            {resumo.canceladosCount}
          </p>
        </div>

        <div className="rounded-2xl bg-slate-900 p-6">
          <p className="text-sm text-slate-400">Ticket Médio (efetivado)</p>
          <p className="mt-2 text-3xl font-bold text-blue-300">
            {formatarMoeda(ticketMedio)}
          </p>
        </div>

        <div className="rounded-2xl bg-slate-900 p-6">
          <p className="text-sm text-slate-400">Lucro Estimado</p>
          <p className="mt-2 text-3xl font-bold text-emerald-300">
            {formatarMoeda(lucroEstimado)}
          </p>
        </div>

        <div className="rounded-2xl bg-slate-900 p-6">
          <p className="text-sm text-slate-400">Nota Média</p>
          <p className="mt-2 text-4xl font-bold text-yellow-300">{notaMedia}</p>
        </div>

        <div className="rounded-2xl bg-slate-900 p-6">
          <p className="text-sm text-slate-400">Produtos sem Estoque</p>
          <p className="mt-2 text-4xl font-bold text-red-300">
            {produtosSemEstoque ?? 0}
          </p>
        </div>

        <div className="rounded-2xl bg-slate-900 p-6">
          <p className="text-sm text-slate-400">Lojas Ativas</p>
          <p className="mt-2 text-4xl font-bold">
            {lojasAtivas ?? 0}/{totalLojas ?? 0}
          </p>
        </div>

        <div className="rounded-2xl bg-slate-900 p-6">
          <p className="text-sm text-slate-400">Taxa de Automação</p>
          <p className="mt-2 text-4xl font-bold">{taxaAutomacao}%</p>
        </div>
      </div>

      <DashboardCharts
        vendasPorPeriodo={resumo.vendasPorPeriodo}
        financeiroResumo={financeiroResumo}
        avaliacoesPorNota={avaliacoesPorNota}
        faturamentoPorMarketplace={resumo.faturamentoPorMarketplace}
        pedidosPorStatus={resumo.pedidosPorStatus}
      />

      {/* Pedidos efetivados recentes */}
      <section className="mt-10 rounded-2xl bg-slate-900 p-6">
        <div className="flex flex-col gap-1">
          <h2 className="text-2xl font-bold">✅ Pedidos Efetivados Recentes</h2>
          <p className="text-sm text-slate-400">
            Vendas reais (não canceladas) com valor, cliente, status e data.
          </p>
        </div>

        <div className="mt-6 overflow-x-auto rounded-xl border border-slate-800">
          <table className="w-full text-left">
            <thead className="bg-slate-800 text-sm text-slate-300">
              <tr>
                <th className="p-4">Pedido</th>
                <th className="p-4">Cliente</th>
                <th className="p-4">Marketplace</th>
                <th className="p-4">Valor</th>
                <th className="p-4">Status</th>
                <th className="p-4">Data</th>
              </tr>
            </thead>

            <tbody>
              {efetivadosRecentes.length > 0 ? (
                efetivadosRecentes.map((pedido, index) => (
                  <tr
                    key={`${pedido.pedido_externo_id}-${index}`}
                    className="border-t border-slate-800"
                  >
                    <td className="p-4 font-semibold">
                      {pedido.pedido_externo_id || "-"}
                    </td>
                    <td className="p-4 text-slate-300">
                      {pedido.cliente_nome || "-"}
                    </td>
                    <td className="p-4 text-slate-300">
                      {pedido.marketplace || "-"}
                    </td>
                    <td className="p-4 text-green-300">
                      {formatarMoeda(num(pedido.valor_total))}
                    </td>
                    <td className="p-4">
                      <span className="rounded-full bg-emerald-900 px-3 py-1 text-xs font-semibold text-emerald-300">
                        {rotuloStatus(pedido.status)}
                      </span>
                    </td>
                    <td className="p-4 text-slate-400">
                      {pedido.data_pedido
                        ? formatarDataHora(pedido.data_pedido)
                        : "-"}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="p-4 text-slate-400" colSpan={6}>
                    Nenhum pedido efetivado encontrado para o filtro
                    selecionado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-10 rounded-2xl bg-slate-900 p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-2xl font-bold">🏆 Top 10 Produtos</h2>
            <p className="mt-1 text-sm text-slate-400">
              Ranking baseado nos dados importados no AutoHub.
            </p>
          </div>

          <GerarRankingButton />
        </div>

        <div className="mt-6 overflow-hidden rounded-xl border border-slate-800">
          <table className="w-full text-left">
            <thead className="bg-slate-800 text-sm text-slate-300">
              <tr>
                <th className="p-4">#</th>
                <th className="p-4">Produto</th>
                <th className="p-4">Loja</th>
                <th className="p-4">Pedidos</th>
                <th className="p-4">Faturamento</th>
                <th className="p-4">Lucro</th>
              </tr>
            </thead>

            <tbody>
              {rankingProdutos && rankingProdutos.length > 0 ? (
                rankingProdutos.map((item, index) => (
                  <tr key={item.id} className="border-t border-slate-800">
                    <td className="p-4 font-bold text-yellow-300">
                      {index + 1}
                    </td>

                    <td className="p-4">
                      <p className="font-semibold">
                        {item.produtos?.nome || "Produto sem nome"}
                      </p>
                      <p className="text-xs text-slate-500">
                        {item.produtos?.sku || "Sem SKU"}
                      </p>
                    </td>

                    <td className="p-4 text-orange-300">
                      {item.lojas?.apelido || "Sem loja"}
                    </td>

                    <td className="p-4">{item.pedidos ?? 0}</td>

                    <td className="p-4 text-green-300">
                      {formatarMoeda(Number(item.faturamento || 0))}
                    </td>

                    <td className="p-4 text-blue-300">
                      {formatarMoeda(Number(item.lucro || 0))}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="p-4 text-slate-400" colSpan={6}>
                    Nenhum ranking gerado ainda. Clique em “Gerar Ranking”.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-10 rounded-2xl bg-slate-900 p-6">
        <h2 className="text-2xl font-bold">Últimas Avaliações</h2>

        <div className="mt-6 space-y-4">
          {ultimasAvaliacoes && ultimasAvaliacoes.length > 0 ? (
            ultimasAvaliacoes.map((item) => (
              <div key={item.id} className="rounded-xl bg-slate-800 p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-bold">{item.nome_produto}</p>
                    <p className="text-sm text-slate-400">
                      Cliente: {item.nome_cliente}
                    </p>
                  </div>

                  <span className="rounded-full bg-green-900 px-3 py-1 text-xs font-semibold text-green-300">
                    {item.status || "recebida"}
                  </span>
                </div>

                <p className="mt-3">
                  {"⭐".repeat(Number(item.avaliacao || 0))}
                </p>

                <p className="mt-3 text-slate-300">{item.comentario}</p>
              </div>
            ))
          ) : (
            <p className="text-slate-400">
              Nenhuma avaliação encontrada para o filtro selecionado.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
