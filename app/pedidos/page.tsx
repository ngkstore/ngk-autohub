import { supabase } from "@/lib/supabase";
import { escopoDoUsuario, filtroLojas } from "@/lib/conta";

export const dynamic = "force-dynamic";

function obterIntervaloPeriodo(periodo?: string) {
  const agora = new Date();
  const inicio = new Date();
  const fim = new Date();

  switch (periodo) {
    case "hoje":
      inicio.setHours(0, 0, 0, 0);
      fim.setHours(23, 59, 59, 999);
      return { inicio, fim };

    case "ontem":
      inicio.setDate(agora.getDate() - 1);
      inicio.setHours(0, 0, 0, 0);
      fim.setDate(agora.getDate() - 1);
      fim.setHours(23, 59, 59, 999);
      return { inicio, fim };

    case "7dias":
      inicio.setDate(agora.getDate() - 7);
      return { inicio, fim };

    case "30dias":
      inicio.setDate(agora.getDate() - 30);
      return { inicio, fim };

    case "mes":
      inicio.setDate(1);
      inicio.setHours(0, 0, 0, 0);
      return { inicio, fim };

    case "ano":
      inicio.setMonth(0, 1);
      inicio.setHours(0, 0, 0, 0);
      return { inicio, fim };

    case "todos":
    default:
      return null;
  }
}

export default async function PedidosPage({
  searchParams,
}: {
  searchParams: Promise<{ loja?: string; periodo?: string }>;
}) {
  const params = await searchParams;

  const periodo = params.periodo;
  const escopo = await escopoDoUsuario();
  const lojas = filtroLojas(escopo, params.loja);

  const intervalo = obterIntervaloPeriodo(periodo);

  let pedidosQuery = supabase
    .from("pedidos")
    .select("*, lojas(apelido)")
    .order("criado_em", { ascending: false })
    .limit(50);

  if (lojas) {
    pedidosQuery = pedidosQuery.in("loja_id", lojas);
  }

  if (intervalo) {
    pedidosQuery = pedidosQuery
      .gte("data_pedido", intervalo.inicio.toISOString())
      .lte("data_pedido", intervalo.fim.toISOString());
  }

  const { data: pedidos } = await pedidosQuery;

  const totalPedidos = pedidos?.length || 0;

  const pedidosPendentes =
    pedidos?.filter((pedido) => pedido.status !== "entregue").length || 0;

  const faturamento =
    pedidos?.reduce(
      (total, pedido) => total + Number(pedido.valor_total || 0),
      0
    ) || 0;

  return (
    <div className="p-8 text-white">
      <h1 className="text-4xl font-bold">Pedidos</h1>

      <p className="mt-2 text-slate-400">
        Acompanhe pedidos, status, clientes e valores. Filtre pela loja no topo.
      </p>

      <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-3">
        <div className="rounded-2xl bg-slate-900 p-6">
          <p className="text-sm text-slate-400">Pedidos no Período</p>
          <p className="mt-2 text-4xl font-bold">{totalPedidos}</p>
        </div>

        <div className="rounded-2xl bg-slate-900 p-6">
          <p className="text-sm text-slate-400">Pedidos em Aberto</p>
          <p className="mt-2 text-4xl font-bold">{pedidosPendentes}</p>
        </div>

        <div className="rounded-2xl bg-slate-900 p-6">
          <p className="text-sm text-slate-400">Valor no Período</p>
          <p className="mt-2 text-4xl font-bold">
            R$ {Number(faturamento || 0).toFixed(2)}
          </p>
        </div>
      </div>

      <section className="mt-10 rounded-2xl bg-slate-900 p-6">
        <h2 className="text-2xl font-bold">Últimos Pedidos</h2>

        <div className="mt-6 overflow-hidden rounded-xl border border-slate-800">
          <table className="w-full text-left">
            <thead className="bg-slate-800 text-sm text-slate-300">
              <tr>
                <th className="p-4">Pedido</th>
                <th className="p-4">Cliente</th>
                <th className="p-4">Loja</th>
                <th className="p-4">Marketplace</th>
                <th className="p-4">Valor</th>
                <th className="p-4">Status</th>
              </tr>
            </thead>

            <tbody>
              {pedidos && pedidos.length > 0 ? (
                pedidos.map((pedido) => (
                  <tr key={pedido.id} className="border-t border-slate-800">
                    <td className="p-4 font-semibold">
                      {pedido.pedido_externo_id || pedido.id}
                    </td>

                    <td className="p-4 text-slate-300">
                      {pedido.cliente_nome || "-"}
                    </td>

                    <td className="p-4 text-orange-300">
                      {pedido.lojas?.apelido || "Sem loja"}
                    </td>

                    <td className="p-4 text-slate-300">
                      {pedido.marketplace}
                    </td>

                    <td className="p-4">
                      R$ {Number(pedido.valor_total || 0).toFixed(2)}
                    </td>

                    <td className="p-4">
                      <span className="rounded-full bg-yellow-900 px-3 py-1 text-xs font-semibold text-yellow-300">
                        {pedido.status || "sem status"}
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="p-4 text-slate-400" colSpan={6}>
                    Nenhum pedido encontrado para os filtros selecionados.
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