import { supabase } from "@/lib/supabase";
import DashboardCharts from "./components/DashboardCharts";
import GerarRankingButton from "./components/GerarRankingButton";

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

const mapaLojas: Record<string, string> = {
  "ngk-shopee": "NGK Shopee",
  "pitibiribas-shopee": "Pitibiribas Shopee",
  "ngk-tiktok": "NGK TikTok",
  "pitibiribas-tiktok": "Pitibiribas TikTok",
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

function getPeriodoFiltro(periodo?: string) {
  const [ano, mes, dia] = diaBRT(new Date()).split("-").map(Number);
  const base = new Date(Date.UTC(ano, mes - 1, dia));

  const isoDe = (d: Date) =>
    isoInicioBRT(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());

  const recuar = (dias: number) => {
    const d = new Date(base);
    d.setUTCDate(d.getUTCDate() - dias);
    return isoDe(d);
  };

  switch (periodo) {
    case "hoje":
      return isoInicioBRT(ano, mes, dia);

    case "ontem":
      return recuar(1);

    case "7dias":
      return recuar(7);

    case "30dias":
      return recuar(30);

    case "mes":
      return isoInicioBRT(ano, mes, 1);

    case "ano":
      return isoInicioBRT(ano, 1, 1);

    default:
      return null;
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
async function buscarTodosPedidos(
  lojaId: string | null,
  periodoFiltro: string | null
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

    if (lojaId) query = query.eq("loja_id", lojaId);
    if (periodoFiltro) query = query.gte("data_pedido", periodoFiltro);

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
  lojaId: string | null,
  periodoFiltro: string | null
): Promise<ResumoCalculado> {
  const { data: resumoRpc } = await supabase.rpc("resumo_pedidos", {
    p_loja_id: lojaId,
    p_inicio: periodoFiltro,
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

  // ---- Fallback paginado ----
  const pedidos = await buscarTodosPedidos(lojaId, periodoFiltro);

  const efetivados = pedidos.filter((p) => p.pedido_efetivado);
  const faturados = pedidos.filter((p) => p.entra_faturamento);
  const cancelados = pedidos.filter(
    (p) => !p.pedido_efetivado && p.status !== "UNPAID"
  );

  const vendasMap = new Map<string, number>();
  efetivados.forEach((p) => {
    if (!p.data_pedido) return;
    const chave = diaBRT(new Date(p.data_pedido)); // agrupa por dia em Brasília
    vendasMap.set(chave, (vendasMap.get(chave) || 0) + num(p.valor_total));
  });

  const marketplaceMap = new Map<string, number>();
  efetivados.forEach((p) => {
    const mk = p.marketplace || "sem marketplace";
    marketplaceMap.set(mk, (marketplaceMap.get(mk) || 0) + num(p.valor_total));
  });

  const statusMap = new Map<string, number>();
  pedidos.forEach((p) => {
    const label = rotuloStatus(p.status);
    statusMap.set(label, (statusMap.get(label) || 0) + 1);
  });

  return {
    totalPedidos: pedidos.length,
    efetivadosCount: efetivados.length,
    faturadosCount: faturados.length,
    canceladosCount: cancelados.length,
    faturamentoGeral: pedidos.reduce((t, p) => t + num(p.valor_total), 0),
    faturamentoEfetivado: efetivados.reduce((t, p) => t + num(p.valor_total), 0),
    faturamentoConcluido: faturados.reduce((t, p) => t + num(p.valor_total), 0),
    vendasPorPeriodo: Array.from(vendasMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([chave, faturamento]) => ({
        data: formatarDiaCurto(chave),
        faturamento,
      })),
    faturamentoPorMarketplace: Array.from(marketplaceMap.entries()).map(
      ([marketplace, faturamento]) => ({ marketplace, faturamento })
    ),
    pedidosPorStatus: Array.from(statusMap.entries())
      .map(([status, quantidade]) => ({ status, quantidade }))
      .sort((a, b) => b.quantidade - a.quantidade),
  };
}

export default async function Dashboard({ searchParams }: DashboardProps) {
  const params = await searchParams;

  const lojaSlug = params.loja;
  const periodoFiltro = getPeriodoFiltro(params.periodo);
  const apelidoLoja = lojaSlug ? mapaLojas[lojaSlug] : null;

  let lojaId: string | null = null;

  if (apelidoLoja) {
    const { data: loja } = await supabase
      .from("lojas")
      .select("id")
      .eq("apelido", apelidoLoja)
      .single();

    lojaId = loja?.id || null;
  }

  let avaliacoesQuery = supabase
    .from("avaliacoes")
    .select("*", { count: "exact", head: true });

  let avaliacoesMediaQuery = supabase.from("avaliacoes").select("avaliacao");

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

  if (lojaId) {
    avaliacoesQuery = avaliacoesQuery.eq("loja_id", lojaId);
    avaliacoesMediaQuery = avaliacoesMediaQuery.eq("loja_id", lojaId);
    ultimasQuery = ultimasQuery.eq("loja_id", lojaId);
    produtosSemEstoqueQuery = produtosSemEstoqueQuery.eq("loja_id", lojaId);
    financeiroQuery = financeiroQuery.eq("loja_id", lojaId);
    rankingQuery = rankingQuery.eq("loja_id", lojaId);
    recentesQuery = recentesQuery.eq("loja_id", lojaId);
  }

  if (periodoFiltro) {
    avaliacoesQuery = avaliacoesQuery.gte("criado_em", periodoFiltro);
    avaliacoesMediaQuery = avaliacoesMediaQuery.gte("criado_em", periodoFiltro);
    ultimasQuery = ultimasQuery.gte("criado_em", periodoFiltro);
    produtosSemEstoqueQuery = produtosSemEstoqueQuery.gte(
      "criado_em",
      periodoFiltro
    );
    financeiroQuery = financeiroQuery.gte("data_movimento", periodoFiltro);
    recentesQuery = recentesQuery.gte("data_pedido", periodoFiltro);
  }

  const resumo = await calcularResumoPedidos(lojaId, periodoFiltro);

  const { count: totalAvaliacoes } = await avaliacoesQuery;
  const { data: avaliacoesMedia } = await avaliacoesMediaQuery;
  const { data: ultimasAvaliacoes } = await ultimasQuery;
  const { count: produtosSemEstoque } = await produtosSemEstoqueQuery;
  const { data: financeiro } = await financeiroQuery;
  const { data: rankingProdutos } = await rankingQuery;
  const { data: efetivadosRecentesData } = await recentesQuery;

  const efetivadosRecentes = (efetivadosRecentesData as PedidoRow[]) || [];

  let respostasQuery = supabase
    .from("respostas_ia")
    .select("*, avaliacoes!inner(loja_id, criado_em)", {
      count: "exact",
      head: true,
    });

  if (lojaId) {
    respostasQuery = respostasQuery.eq("avaliacoes.loja_id", lojaId);
  }

  if (periodoFiltro) {
    respostasQuery = respostasQuery.gte("avaliacoes.criado_em", periodoFiltro);
  }

  const { count: totalRespostas } = await respostasQuery;

  const { count: totalLojas } = await supabase
    .from("lojas")
    .select("*", { count: "exact", head: true });

  const { count: lojasAtivas } = await supabase
    .from("lojas")
    .select("*", { count: "exact", head: true })
    .eq("status", "ativo");

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

  const notaMedia =
    avaliacoesMedia && avaliacoesMedia.length > 0
      ? (
          avaliacoesMedia.reduce(
            (total, item) => total + Number(item.avaliacao || 0),
            0
          ) / avaliacoesMedia.length
        ).toFixed(1)
      : "0.0";

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
    quantidade:
      avaliacoesMedia?.filter((item) => Number(item.avaliacao) === nota)
        .length || 0,
  }));

  return (
    <div className="p-8 text-white">
      <h1 className="text-4xl font-bold">Dashboard</h1>

      <p className="mt-2 text-slate-400">
        {apelidoLoja
          ? `Visão geral da loja ${apelidoLoja}.`
          : "Visão geral das operações da NGK Store."}
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
