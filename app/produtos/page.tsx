import { supabase } from "@/lib/supabase";

type ProdutosPageProps = {
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

export default async function ProdutosPage({
  searchParams,
}: ProdutosPageProps) {
  const lojaFiltro = searchParams?.loja;
  const periodoFiltro = getPeriodoFiltro(searchParams?.periodo);

  let lojaId: string | null = null;

  if (lojaFiltro && lojaFiltro !== "todas") {
    const { data: loja } = await supabase
      .from("lojas")
      .select("id")
      .eq("apelido", lojaFiltro)
      .single();

    lojaId = loja?.id || null;
  }

  let totalProdutosQuery = supabase
    .from("produtos")
    .select("*", { count: "exact", head: true });

  let produtosAtivosQuery = supabase
    .from("produtos")
    .select("*", { count: "exact", head: true })
    .eq("status", "ativo");

  let produtosQuery = supabase
    .from("produtos")
    .select("*, lojas(apelido)")
    .order("criado_em", { ascending: false })
    .limit(20);

  if (lojaId) {
    totalProdutosQuery = totalProdutosQuery.eq("loja_id", lojaId);
    produtosAtivosQuery = produtosAtivosQuery.eq("loja_id", lojaId);
    produtosQuery = produtosQuery.eq("loja_id", lojaId);
  }

  if (periodoFiltro) {
    totalProdutosQuery = totalProdutosQuery.gte(
      "criado_em",
      periodoFiltro
    );

    produtosAtivosQuery = produtosAtivosQuery.gte(
      "criado_em",
      periodoFiltro
    );

    produtosQuery = produtosQuery.gte(
      "criado_em",
      periodoFiltro
    );
  }

  const { count: totalProdutos } = await totalProdutosQuery;
  const { count: produtosAtivos } = await produtosAtivosQuery;
  const { data: produtos } = await produtosQuery;

  return (
    <div className="p-8 text-white">
      <h1 className="text-4xl font-bold">Produtos</h1>

      <p className="mt-2 text-slate-400">
        Cadastro, estoque, margem e performance dos produtos.
      </p>

      <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-3">
        <div className="rounded-2xl bg-slate-900 p-6">
          <p className="text-sm text-slate-400">
            Produtos Cadastrados
          </p>

          <p className="mt-2 text-4xl font-bold">
            {totalProdutos ?? 0}
          </p>
        </div>

        <div className="rounded-2xl bg-slate-900 p-6">
          <p className="text-sm text-slate-400">
            Produtos Ativos
          </p>

          <p className="mt-2 text-4xl font-bold">
            {produtosAtivos ?? 0}
          </p>
        </div>

        <div className="rounded-2xl bg-slate-900 p-6">
          <p className="text-sm text-slate-400">
            Controle de Estoque
          </p>

          <p className="mt-2 text-2xl font-bold text-blue-300">
            Preparado
          </p>
        </div>
      </div>

      <section className="mt-10 rounded-2xl bg-slate-900 p-6">
        <h2 className="text-2xl font-bold">
          Lista de Produtos
        </h2>

        <div className="mt-6 overflow-hidden rounded-xl border border-slate-800">
          <table className="w-full text-left">
            <thead className="bg-slate-800 text-sm text-slate-300">
              <tr>
                <th className="p-4">Produto</th>
                <th className="p-4">SKU</th>
                <th className="p-4">Loja</th>
                <th className="p-4">Preço</th>
                <th className="p-4">Custo</th>
                <th className="p-4">Estoque</th>
                <th className="p-4">Status</th>
              </tr>
            </thead>

            <tbody>
              {produtos && produtos.length > 0 ? (
                produtos.map((produto) => (
                  <tr
                    key={produto.id}
                    className="border-t border-slate-800"
                  >
                    <td className="p-4 font-semibold">
                      {produto.nome}
                    </td>

                    <td className="p-4 text-slate-300">
                      {produto.sku || "-"}
                    </td>

                    <td className="p-4 text-orange-300">
                      {produto.lojas?.apelido || "Sem loja"}
                    </td>

                    <td className="p-4">
                      {produto.preco
                        ? `R$ ${Number(produto.preco).toFixed(2)}`
                        : "-"}
                    </td>

                    <td className="p-4">
                      {produto.custo
                        ? `R$ ${Number(produto.custo).toFixed(2)}`
                        : "-"}
                    </td>

                    <td className="p-4">
                      {produto.estoque ?? 0}
                    </td>

                    <td className="p-4">
                      <span className="rounded-full bg-green-900 px-3 py-1 text-xs font-semibold text-green-300">
                        {produto.status}
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    className="p-4 text-slate-400"
                    colSpan={7}
                  >
                    Nenhum produto encontrado para o filtro
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