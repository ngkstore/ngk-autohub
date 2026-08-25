import { supabase } from "@/lib/supabase";

// Gera o ranking de produtos AGREGANDO no banco (RPC gerar_ranking_produtos):
// soma unidades/receita por item_id a partir do item_list dos pedidos (90 dias)
// e calcula o lucro com o custo (variação -> item). Antes isso era um N+1 que
// contava os pedidos da loja inteira para CADA produto (errado e pesadíssimo).
export async function gerarRankingProdutos() {
  const { error } = await supabase.rpc("gerar_ranking_produtos");
  if (error) throw error;
  return { sucesso: true, mensagem: "Ranking de produtos gerado com sucesso." };
}
