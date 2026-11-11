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
  searchParams: Promise<{ loja?: string; periodo?: string; q?: string }>;
}) {
  const params = await searchParams;

  const periodo = params.periodo;
  const busca = (params.q || "").trim();
  const escopo = await escopoDoUsuario();
  const lojas = filtroLojas(escopo, params.loja);

  const intervalo = obterIntervaloPeriodo(periodo);

  // Tabela: só as colunas exibidas (sem a jsonb gorda dados_pedido).
  let pedidosQuery = supabase
    .from("pedidos")
    .select("id, pedido_externo_id, cliente_nome, marketplace, valor_total, status, lojas(apelido)")
    .order("criado_em", { ascending: false })
    .limit(50);

  if (lojas) {
    pedidosQuery = pedidosQuery.in("loja_id", lojas);
  }
  if (busca) {
    // Busca da barra superior (A2): número do pedido ou nome do cliente.
    pedidosQuery = pedidosQuery.or(`pedido_externo_id.ilike.%${busca}%,cliente_nome.ilike.%${busca}%`);
  }
  if (intervalo) {
    pedidosQuery = pedidosQuery
      .gte("data_pedido", intervalo.inicio.toISOString())
      .lte("data_pedido", intervalo.fim.toISOString());
  }

  // KPIs: agregados no banco (antes eram calculados só sobre as 50 linhas -> errados).
  const [{ data: pedidosRaw }, { data: resumoData }] = await Promise.all([
    pedidosQuery,
    supabase.rpc("resumo_pedidos", {
      p_loja_ids: lojas,
      p_inicio: intervalo ? intervalo.inicio.toISOString() : null,
      p_fim: intervalo ? intervalo.fim.toISOString() : null,
    }),
  ]);
  const resumo = (resumoData as {
    total_pedidos: number; pedidos_efetivados: number; faturamento_efetivado: number;
  } | null) || { total_pedidos: 0, pedidos_efetivados: 0, faturamento_efetivado: 0 };
  const totalPedidos = Number(resumo.total_pedidos || 0);
  const pedidosEfetivados = Number(resumo.pedidos_efetivados || 0);
  const faturamento = Number(resumo.faturamento_efetivado || 0);

  const pedidos = (pedidosRaw || []) as unknown as Array<{
    id: string;
    pedido_externo_id: string | null;
    cliente_nome: string | null;
    marketplace: string | null;
    valor_total: number | null;
    status: string | null;
    lojas: { apelido: string } | null;
  }>;

  return (
    <div className="mx-auto max-w-[1400px] p-6">
      <h1 className="text-[22px] font-bold tracking-[-0.01em] text-texto">Pedidos</h1>

      <p className="mt-0.5 text-[13px] text-texto-2">
        Acompanhe pedidos, status, clientes e valores. Filtre pela loja no topo.
        {busca && <> Mostrando resultados para <b className="text-texto">“{busca}”</b>. <a href="/pedidos" className="text-primaria underline">Limpar</a></>}
      </p>

      <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-3">
        <div className="rounded-[14px] border border-borda bg-superficie p-6 shadow-cartao">
          <p className="text-sm text-texto-2">Pedidos no Período</p>
          <p className="mt-2 text-4xl font-bold">{totalPedidos}</p>
        </div>

        <div className="rounded-[14px] border border-borda bg-superficie p-6 shadow-cartao">
          <p className="text-sm text-texto-2">Pedidos Efetivados</p>
          <p className="mt-2 text-4xl font-bold text-sucesso">{pedidosEfetivados}</p>
        </div>

        <div className="rounded-[14px] border border-borda bg-superficie p-6 shadow-cartao">
          <p className="text-sm text-texto-2">Valor Efetivado (período)</p>
          <p className="mt-2 text-4xl font-bold">
            R$ {Number(faturamento || 0).toFixed(2)}
          </p>
        </div>
      </div>

      <section className="mt-6 rounded-[14px] border border-borda bg-superficie p-6 shadow-cartao">
        <h2 className="text-[15px] font-semibold text-texto">Últimos Pedidos</h2>

        <div className="mt-6 overflow-hidden rounded-xl border border-borda">
          <table className="w-full text-left">
            <thead className="bg-superficie-2 text-xs font-semibold text-texto-2">
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
                  <tr key={pedido.id} className="border-t border-borda">
                    <td className="p-4 font-semibold">
                      {pedido.pedido_externo_id || pedido.id}
                    </td>

                    <td className="p-4 text-texto">
                      {pedido.cliente_nome || "-"}
                    </td>

                    <td className="p-4 text-alerta">
                      {pedido.lojas?.apelido || "Sem loja"}
                    </td>

                    <td className="p-4 text-texto">
                      {pedido.marketplace}
                    </td>

                    <td className="p-4">
                      R$ {Number(pedido.valor_total || 0).toFixed(2)}
                    </td>

                    <td className="p-4">
                      <span className="rounded-full bg-chip-amarelo-fundo px-3 py-1 text-xs font-semibold text-alerta">
                        {pedido.status || "sem status"}
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="p-4 text-texto-2" colSpan={6}>
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