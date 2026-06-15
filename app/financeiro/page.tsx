import { supabase } from "@/lib/supabase";

type FinanceiroPageProps = {
  searchParams: {
    loja?: string;
    periodo?: string;
  };
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

export default async function FinanceiroPage({
  searchParams,
}: FinanceiroPageProps) {
  const lojaFiltro = searchParams?.loja;
  const periodoFiltro = getPeriodoFiltro(searchParams?.periodo);

  let query = supabase
    .from("financeiro")
    .select("*, lojas(apelido)")
    .order("criado_em", { ascending: false })
    .limit(50);

  if (lojaFiltro && lojaFiltro !== "todas") {
    const { data: loja } = await supabase
      .from("lojas")
      .select("id")
      .eq("apelido", lojaFiltro)
      .single();

    if (loja?.id) {
      query = query.eq("loja_id", loja.id);
    }
  }

  if (periodoFiltro) {
    query = query.gte("data_movimento", periodoFiltro);
  }

  const { data: movimentos } = await query;

  const totalReceitas =
    movimentos
      ?.filter((item) => item.tipo === "receita")
      .reduce((total, item) => total + Number(item.valor || 0), 0) || 0;

  const totalDespesas =
    movimentos
      ?.filter((item) => item.tipo === "despesa")
      .reduce((total, item) => total + Number(item.valor || 0), 0) || 0;

  const saldo = totalReceitas - totalDespesas;

  return (
    <div className="p-8 text-white">
      <h1 className="text-4xl font-bold">Financeiro</h1>

      <p className="mt-2 text-slate-400">
        Conciliação financeira, taxas, comissões, fretes e lucro por marketplace.
      </p>

      <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-3">
        <div className="rounded-2xl bg-slate-900 p-6">
          <p className="text-sm text-slate-400">Receitas</p>
          <p className="mt-2 text-4xl font-bold text-green-300">
            R$ {totalReceitas.toFixed(2)}
          </p>
        </div>

        <div className="rounded-2xl bg-slate-900 p-6">
          <p className="text-sm text-slate-400">Despesas / Taxas</p>
          <p className="mt-2 text-4xl font-bold text-red-300">
            R$ {totalDespesas.toFixed(2)}
          </p>
        </div>

        <div className="rounded-2xl bg-slate-900 p-6">
          <p className="text-sm text-slate-400">Saldo Estimado</p>
          <p className="mt-2 text-4xl font-bold text-blue-300">
            R$ {saldo.toFixed(2)}
          </p>
        </div>
      </div>

      <section className="mt-10 rounded-2xl bg-slate-900 p-6">
        <h2 className="text-2xl font-bold">Movimentações Financeiras</h2>

        <div className="mt-6 overflow-hidden rounded-xl border border-slate-800">
          <table className="w-full text-left">
            <thead className="bg-slate-800 text-sm text-slate-300">
              <tr>
                <th className="p-4">Tipo</th>
                <th className="p-4">Descrição</th>
                <th className="p-4">Loja</th>
                <th className="p-4">Marketplace</th>
                <th className="p-4">Valor</th>
                <th className="p-4">Data</th>
              </tr>
            </thead>

            <tbody>
              {movimentos && movimentos.length > 0 ? (
                movimentos.map((item) => (
                  <tr key={item.id} className="border-t border-slate-800">
                    <td className="p-4">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${
                          item.tipo === "receita"
                            ? "bg-green-900 text-green-300"
                            : "bg-red-900 text-red-300"
                        }`}
                      >
                        {item.tipo || "sem tipo"}
                      </span>
                    </td>

                    <td className="p-4 font-semibold">
                      {item.descricao || "-"}
                    </td>

                    <td className="p-4 text-orange-300">
                      {item.lojas?.apelido || "Sem loja"}
                    </td>

                    <td className="p-4 text-slate-300">
                      {item.marketplace}
                    </td>

                    <td className="p-4">
                      R$ {Number(item.valor || 0).toFixed(2)}
                    </td>

                    <td className="p-4 text-slate-400">
                      {item.data_movimento
                        ? new Date(item.data_movimento).toLocaleDateString(
                            "pt-BR"
                          )
                        : "-"}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="p-4 text-slate-400" colSpan={6}>
                    Nenhuma movimentação financeira encontrada para o filtro
                    selecionado.
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