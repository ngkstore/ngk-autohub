import { supabase } from "@/lib/supabase";
import { escopoDoUsuario, filtroLojas } from "@/lib/conta";

export const dynamic = "force-dynamic";

type AnalyticsPageProps = {
  searchParams: Promise<{
    loja?: string;
    periodo?: string;
  }>;
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

export default async function AnalyticsPage({
  searchParams,
}: AnalyticsPageProps) {
  const params = await searchParams;
  const periodoFiltro = getPeriodoFiltro(params.periodo);
  const escopo = await escopoDoUsuario();
  const lojas = filtroLojas(escopo, params.loja);

  let avaliacoesCountQuery = supabase
    .from("avaliacoes")
    .select("*", { count: "exact", head: true });

  let produtosCountQuery = supabase
    .from("produtos")
    .select("*", { count: "exact", head: true });

  let pedidosCountQuery = supabase
    .from("pedidos")
    .select("*", { count: "exact", head: true });

  let chatsCountQuery = supabase
    .from("chat_conversas")
    .select("*", { count: "exact", head: true });

  let avaliacoesQuery = supabase
    .from("avaliacoes")
    .select("avaliacao, nome_produto, criado_em, lojas(apelido)")
    .order("criado_em", { ascending: false })
    .limit(100);

  if (lojas) {
    avaliacoesCountQuery = avaliacoesCountQuery.in("loja_id", lojas);
    produtosCountQuery = produtosCountQuery.in("loja_id", lojas);
    pedidosCountQuery = pedidosCountQuery.in("loja_id", lojas);
    chatsCountQuery = chatsCountQuery.in("loja_id", lojas);
    avaliacoesQuery = avaliacoesQuery.in("loja_id", lojas);
  }

  if (periodoFiltro) {
    avaliacoesCountQuery = avaliacoesCountQuery.gte("criado_em", periodoFiltro);
    produtosCountQuery = produtosCountQuery.gte("criado_em", periodoFiltro);
    pedidosCountQuery = pedidosCountQuery.gte("data_pedido", periodoFiltro);
    // chat_conversas não tem coluna de data ISO (só atualizado_em/ts) — sem filtro.
    avaliacoesQuery = avaliacoesQuery.gte("criado_em", periodoFiltro);
  }

  const { count: totalAvaliacoes } = await avaliacoesCountQuery;
  const { count: totalProdutos } = await produtosCountQuery;
  const { count: totalPedidos } = await pedidosCountQuery;
  const { count: totalChats } = await chatsCountQuery;
  const { data: avaliacoes } = await avaliacoesQuery;

  const mediaAvaliacoes =
    avaliacoes && avaliacoes.length > 0
      ? (
          avaliacoes.reduce(
            (total, item) => total + Number(item.avaliacao || 0),
            0
          ) / avaliacoes.length
        ).toFixed(1)
      : "0.0";

  return (
    <div className="p-8 text-white">
      <h1 className="text-4xl font-bold">Analytics</h1>

      <p className="mt-2 text-slate-400">
        Indicadores de performance, vendas, atendimento e reputação.
      </p>

      <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-4">
        <div className="rounded-2xl bg-slate-900 p-6">
          <p className="text-sm text-slate-400">Pedidos</p>
          <p className="mt-2 text-4xl font-bold">{totalPedidos ?? 0}</p>
        </div>

        <div className="rounded-2xl bg-slate-900 p-6">
          <p className="text-sm text-slate-400">Produtos</p>
          <p className="mt-2 text-4xl font-bold">{totalProdutos ?? 0}</p>
        </div>

        <div className="rounded-2xl bg-slate-900 p-6">
          <p className="text-sm text-slate-400">Chats</p>
          <p className="mt-2 text-4xl font-bold">{totalChats ?? 0}</p>
        </div>

        <div className="rounded-2xl bg-slate-900 p-6">
          <p className="text-sm text-slate-400">Média Avaliações</p>
          <p className="mt-2 text-4xl font-bold">{mediaAvaliacoes}</p>
        </div>
      </div>

      <section className="mt-10 grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div className="rounded-2xl bg-slate-900 p-6">
          <h2 className="text-2xl font-bold">Reputação</h2>

          <p className="mt-4 text-slate-400">
            Total de avaliações analisadas:
          </p>

          <p className="mt-2 text-4xl font-bold">{totalAvaliacoes ?? 0}</p>

          <p className="mt-4 text-slate-300">
            Este módulo futuramente mostrará evolução de notas, produtos com
            maior volume de reclamações e alertas de reputação.
          </p>
        </div>

        <div className="rounded-2xl bg-slate-900 p-6">
          <h2 className="text-2xl font-bold">Produtos em Análise</h2>

          <div className="mt-6 space-y-4">
            {avaliacoes && avaliacoes.length > 0 ? (
              avaliacoes.slice(0, 5).map((item, index) => (
                <div key={index} className="rounded-xl bg-slate-800 p-4">
                  <p className="font-semibold">{item.nome_produto}</p>

                  <p className="text-sm text-orange-300">
                    {item.lojas?.[0]?.apelido || "Sem loja"}
                  </p>

                  <p className="mt-2">
                    Nota: {"⭐".repeat(Number(item.avaliacao || 0))}
                  </p>
                </div>
              ))
            ) : (
              <p className="text-slate-400">
                Ainda não há dados suficientes para análise com o filtro
                selecionado.
              </p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}