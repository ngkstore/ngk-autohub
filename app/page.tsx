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

function getPeriodoFiltro(periodo?: string) {
  const hoje = new Date();
  const inicio = new Date();

  switch (periodo) {
    case "hoje":
      inicio.setHours(0, 0, 0, 0);
      return inicio.toISOString();

    case "ontem":
      inicio.setDate(hoje.getDate() - 1);
      inicio.setHours(0, 0, 0, 0);
      return inicio.toISOString();

    case "7dias":
      inicio.setDate(hoje.getDate() - 7);
      return inicio.toISOString();

    case "30dias":
      inicio.setDate(hoje.getDate() - 30);
      return inicio.toISOString();

    case "mes":
      inicio.setDate(1);
      inicio.setHours(0, 0, 0, 0);
      return inicio.toISOString();

    case "ano":
      inicio.setMonth(0, 1);
      inicio.setHours(0, 0, 0, 0);
      return inicio.toISOString();

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

// Busca TODOS os pedidos do filtro paginando (o Supabase limita a 1000 por
// requisição), para os totais ficarem corretos mesmo com milhares de pedidos.
async function buscarTodosPedidos(
  lojaId: string | null,
  periodoFiltro: string | null
): Promise<PedidoRow[]> {
  const pageSize = 1000;
  const maxPaginas = 100; // trava de segurança (até 100 mil pedidos)
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

  if (lojaId) {
    avaliacoesQuery = avaliacoesQuery.eq("loja_id", lojaId);
    avaliacoesMediaQuery = avaliacoesMediaQuery.eq("loja_id", lojaId);
    ultimasQuery = ultimasQuery.eq("loja_id", lojaId);
    produtosSemEstoqueQuery = produtosSemEstoqueQuery.eq("loja_id", lojaId);
    financeiroQuery = financeiroQuery.eq("loja_id", lojaId);
    rankingQuery = rankingQuery.eq("loja_id", lojaId);
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
  }

  const pedidos = await buscarTodosPedidos(lojaId, periodoFiltro);

  const { count: totalAvaliacoes } = await avaliacoesQuery;
  const { data: avaliacoesMedia } = await avaliacoesMediaQuery;
  const { data: ultimasAvaliacoes } = await ultimasQuery;
  const { count: produtosSemEstoque } = await produtosSemEstoqueQuery;
  const { data: financeiro } = await financeiroQuery;
  const { data: rankingProdutos } = await rankingQuery;

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

  // ---- Métricas de pedidos ----
  const totalPedidos = pedidos.length;

  const pedidosEfetivados = pedidos.filter((p) => p.pedido_efetivado);
  const pedidosFaturados = pedidos.filter((p) => p.entra_faturamento);
  const pedidosCancelados = pedidos.filter(
    (p) => !p.pedido_efetivado && p.status !== "UNPAID"
  );

  const faturamentoGeral = pedidos.reduce((t, p) => t + num(p.valor_total), 0);

  const faturamentoEfetivado = pedidosEfetivados.reduce(
    (t, p) => t + num(p.valor_total),
    0
  );

  const faturamentoConcluido = pedidosFaturados.reduce(
    (t, p) => t + num(p.valor_total),
    0
  );

  const ticketMedio =
    pedidosEfetivados.length > 0
      ? faturamentoEfetivado / pedidosEfetivados.length
      : 0;

  const taxaEfetivacao =
    totalPedidos > 0
      ? Math.round((pedidosEfetivados.length / totalPedidos) * 100)
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

  // ---- Dados para gráficos (baseados em pedidos efetivados) ----
  const vendasMap = new Map<string, number>();

  pedidosEfetivados.forEach((pedido) => {
    if (!pedido.data_pedido) return;

    const chave = pedido.data_pedido.slice(0, 10); // yyyy-mm-dd
    vendasMap.set(chave, (vendasMap.get(chave) || 0) + num(pedido.valor_total));
  });

  const vendasPorPeriodo = Array.from(vendasMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([chave, faturamento]) => {
      const [, mes, dia] = chave.split("-");
      return { data: `${dia}/${mes}`, faturamento };
    });

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

  const marketplaceMap = new Map<string, number>();

  pedidosEfetivados.forEach((pedido) => {
    const marketplace = pedido.marketplace || "sem marketplace";
    marketplaceMap.set(
      marketplace,
      (marketplaceMap.get(marketplace) || 0) + num(pedido.valor_total)
    );
  });

  const faturamentoPorMarketplace = Array.from(marketplaceMap.entries()).map(
    ([marketplace, faturamento]) => ({ marketplace, faturamento })
  );

  const statusMap = new Map<string, number>();

  pedidos.forEach((pedido) => {
    const label = rotuloStatus(pedido.status);
    statusMap.set(label, (statusMap.get(label) || 0) + 1);
  });

  const pedidosPorStatus = Array.from(statusMap.entries())
    .map(([status, quantidade]) => ({ status, quantidade }))
    .sort((a, b) => b.quantidade - a.quantidade);

  // Pedidos efetivados mais recentes (com data), para a tabela.
  const efetivadosRecentes = pedidosEfetivados
    .filter((p) => p.data_pedido)
    .slice(0, 20);

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
            {formatarMoeda(faturamentoEfetivado)}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {pedidosEfetivados.length} pedido(s) efetivado(s)
          </p>
        </div>

        <div className="rounded-2xl bg-slate-900 p-6">
          <p className="text-sm text-slate-400">Faturamento Geral (todos)</p>
          <p className="mt-2 text-4xl font-bold text-green-300">
            {formatarMoeda(faturamentoGeral)}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            inclui pendentes e cancelados
          </p>
        </div>

        <div className="rounded-2xl bg-slate-900 p-6">
          <p className="text-sm text-slate-400">Faturamento Concluído</p>
          <p className="mt-2 text-4xl font-bold text-teal-300">
            {formatarMoeda(faturamentoConcluido)}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {pedidosFaturados.length} pedido(s) concluído(s)/a confirmar
          </p>
        </div>
      </div>

      {/* KPIs */}
      <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl bg-slate-900 p-6">
          <p className="text-sm text-slate-400">Total de Pedidos</p>
          <p className="mt-2 text-4xl font-bold">{totalPedidos}</p>
        </div>

        <div className="rounded-2xl bg-slate-900 p-6">
          <p className="text-sm text-slate-400">Pedidos Efetivados</p>
          <p className="mt-2 text-4xl font-bold text-emerald-300">
            {pedidosEfetivados.length}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {taxaEfetivacao}% do total
          </p>
        </div>

        <div className="rounded-2xl bg-slate-900 p-6">
          <p className="text-sm text-slate-400">Cancelados / Não Efetivados</p>
          <p className="mt-2 text-4xl font-bold text-red-300">
            {pedidosCancelados.length}
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
        vendasPorPeriodo={vendasPorPeriodo}
        financeiroResumo={financeiroResumo}
        avaliacoesPorNota={avaliacoesPorNota}
        faturamentoPorMarketplace={faturamentoPorMarketplace}
        pedidosPorStatus={pedidosPorStatus}
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
