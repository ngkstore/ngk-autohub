import { supabase } from "@/lib/supabase";

export async function gerarRankingProdutos() {
  const { data: produtos, error: produtosError } = await supabase
    .from("produtos")
    .select("*");

  if (produtosError) {
    throw produtosError;
  }

  await supabase.from("ranking_produtos").delete().neq("id", "");

  for (const produto of produtos || []) {
    const { data: pedidos } = await supabase
      .from("pedidos")
      .select("*")
      .eq("loja_id", produto.loja_id)
      .ilike("cliente_nome", "%Cliente%");

    const pedidosQtd = pedidos?.length || 0;

    const faturamento =
      pedidos?.reduce(
        (total, pedido) => total + Number(pedido.valor_total || 0),
        0
      ) || 0;

    const custoTotal = Number(produto.custo || 0) * pedidosQtd;
    const lucro = faturamento - custoTotal;

    await supabase.from("ranking_produtos").insert({
      loja_id: produto.loja_id,
      produto_id: produto.id,
      pedidos: pedidosQtd,
      faturamento,
      lucro,
      atualizado_em: new Date().toISOString(),
    });
  }

  return {
    sucesso: true,
    mensagem: "Ranking de produtos gerado com sucesso.",
  };
}