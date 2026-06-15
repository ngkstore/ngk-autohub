import { supabase } from "@/lib/supabase";

type TipoSincronizacao =
  | "produtos"
  | "pedidos"
  | "avaliacoes"
  | "financeiro"
  | "geral";

type ImportadorParams = {
  lojaId: string;
  tipo?: TipoSincronizacao;
};

export async function importarTikTok({
  lojaId,
  tipo = "geral",
}: ImportadorParams) {
  const inicio = new Date();

  try {
    let produtosImportados = 0;
    let pedidosImportados = 0;
    let avaliacoesImportadas = 0;
    let financeiroImportado = 0;

    // Estrutura preparada para futura integração real

    await supabase.from("sincronizacoes").insert({
      loja_id: lojaId,
      marketplace: "tiktok",
      tipo,
      status: "sucesso",
      registros_importados:
        produtosImportados +
        pedidosImportados +
        avaliacoesImportadas +
        financeiroImportado,
      iniciado_em: inicio.toISOString(),
      finalizado_em: new Date().toISOString(),
      mensagem: `Importador TikTok (${tipo}) preparado. Aguardando credenciais oficiais da API TikTok Shop.`,
    });

    await supabase
      .from("configuracoes")
      .update({
        valor: new Date().toISOString(),
        atualizado_em: new Date().toISOString(),
      })
      .eq("chave", "ultima_sincronizacao");

    return {
      sucesso: true,
      marketplace: "tiktok",
      tipo,
      produtosImportados,
      pedidosImportados,
      avaliacoesImportadas,
      financeiroImportado,
      totalImportado:
        produtosImportados +
        pedidosImportados +
        avaliacoesImportadas +
        financeiroImportado,
    };
  } catch (error) {
    await supabase.from("sincronizacoes").insert({
      loja_id: lojaId,
      marketplace: "tiktok",
      tipo,
      status: "erro",
      registros_importados: 0,
      iniciado_em: inicio.toISOString(),
      finalizado_em: new Date().toISOString(),
      mensagem:
        error instanceof Error
          ? error.message
          : "Erro desconhecido ao sincronizar TikTok.",
    });

    return {
      sucesso: false,
      marketplace: "tiktok",
      tipo,
      erro:
        error instanceof Error
          ? error.message
          : "Erro desconhecido ao sincronizar TikTok.",
    };
  }
}