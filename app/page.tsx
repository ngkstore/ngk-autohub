import { supabase } from "@/lib/supabase";
import DashboardCharts from "./components/DashboardCharts";
import GerarRankingButton from "./components/GerarRankingButton";

type DashboardProps = {
  searchParams: Promise<{
    loja?: string;
    periodo?: string;
  }>;
};

const mapaLojas: Record<string, string> = {
  "ngk-shopee": "NGK Shopee",
  "pitibiribas-shopee": "Pitibiribas Shopee",
  "ngk-tiktok": "NGK TikTok",
  "pitibiribas-tiktok": "Pitibiribas TikTok",
};

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

function formatarData(data: string) {
  return new Date(data).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  });
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

  let pedidosQuery = supabase
    .from("pedidos")
    .select("valor_total, data_pedido, marketplace");

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
    pedidosQuery = pedidosQuery.eq("loja_id", lojaId);
    produtosSemEstoqueQuery = produtosSemEstoqueQuery.eq("loja_id", lojaId);
    financeiroQuery = financeiroQuery.eq("loja_id", lojaId);
    rankingQuery = rankingQuery.eq("loja_id", lojaId);
  }

  if (periodoFiltro) {
    avaliacoesQuery = avaliacoesQuery.gte("criado_em", periodoFiltro);
    avaliacoesMediaQuery = avaliacoesMediaQuery.gte("criado_em", periodoFiltro);
    ultimasQuery = ultimasQuery.gte("criado_em", periodoFiltro);
    pedidosQuery = pedidosQuery.gte("data_pedido", periodoFiltro);
    produtosSemEstoqueQuery = produtosSemEstoqueQuery.gte(
      "criado_em",
      periodoFiltro
    );
    financeiroQuery = financeiroQuery.gte("data_movimento", periodoFiltro);
  }

  const { count: totalAvaliacoes } = await avaliacoesQuery;
  const { data: avaliacoesMedia } = await avaliacoesMediaQuery;
  const { data: ultimasAvaliacoes } = await ultimasQuery;
  const { data: pedidos } = await pedidosQuery;
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

  const totalPedidos = pedidos?.length || 0;

  const faturamentoTotal =
    pedidos?.reduce((total, pedido) => {
      return total + Number(pedido.valor_total || 0);
    }, 0) || 0;

  const ticketMedio = totalPedidos > 0 ? faturamentoTotal / totalPedidos : 0;

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

  const vendasMap = new Map<string, number>();

  pedidos?.forEach((pedido) => {
    if (!pedido.data_pedido) return;

    const data = formatarData(pedido.data_pedido);
    const valorAtual = vendasMap.get(data) || 0;

    vendasMap.set(data, valorAtual + Number(pedido.valor_total || 0));
  });

  const vendasPorPeriodo = Array.from(vendasMap.entries()).map(
    ([data, faturamento]) => ({
      data,
      faturamento,
    })
  );

  const financeiroResumo = [
    {
      nome: "Receitas",
      valor: totalReceitas,
    },
    {
      nome: "Despesas",
      valor: totalDespesas,
    },
    {
      nome: "Lucro",
      valor: lucroEstimado,
    },
  ];

  const avaliacoesPorNota = [1, 2, 3, 4, 5].map((nota) => ({
    nota: `${nota} estrela${nota > 1 ? "s" : ""}`,
    quantidade:
      avaliacoesMedia?.filter((item) => Number(item.avaliacao) === nota)
        .length || 0,
  }));

  const marketplaceMap = new Map<string, number>();

  pedidos?.forEach((pedido) => {
    const marketplace = pedido.marketplace || "sem marketplace";
    const valorAtual = marketplaceMap.get(marketplace) || 0;

    marketplaceMap.set(
      marketplace,
      valorAtual + Number(pedido.valor_total || 0)
    );
  });

  const faturamentoPorMarketplace = Array.from(marketplaceMap.entries()).map(
    ([marketplace, faturamento]) => ({
      marketplace,
      faturamento,
    })
  );

  return (
    <div className="p-8 text-white">
      <h1 className="text-4xl font-bold">Dashboard</h1>

      <p className="mt-2 text-slate-400">
        {apelidoLoja
          ? `Visão geral da loja ${apelidoLoja}.`
          : "Visão geral das operações da NGK Store."}
      </p>

      <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl bg-slate-900 p-6">
          <p className="text-sm text-slate-400">Faturamento Total</p>
          <p className="mt-2 text-3xl font-bold text-green-300">
            {formatarMoeda(faturamentoTotal)}
          </p>
        </div>

        <div className="rounded-2xl bg-slate-900 p-6">
          <p className="text-sm text-slate-400">Pedidos</p>
          <p className="mt-2 text-4xl font-bold">{totalPedidos}</p>
        </div>

        <div className="rounded-2xl bg-slate-900 p-6">
          <p className="text-sm text-slate-400">Ticket Médio</p>
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
          <p className="mt-2 text-4xl font-bold text-yellow-300">
            {notaMedia}
          </p>
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
      />

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