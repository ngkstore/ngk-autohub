import { supabase } from "@/lib/supabase";
import { buscarProdutosShopee } from "@/lib/shopee/produtos";
import { buscarPedidosShopee } from "@/lib/shopee/pedidos";
import { buscarAvaliacoesShopee } from "@/lib/shopee/avaliacoes";
import { buscarFinanceiroShopee } from "@/lib/shopee/financeiro";

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

async function lojaTemToken(lojaId: string) {
  const { data } = await supabase
    .from("marketplace_tokens")
    .select("*")
    .eq("loja_id", lojaId)
    .eq("marketplace", "shopee")
    .maybeSingle();

  return !!data?.access_token;
}

async function importarFakeShopee(lojaId: string, tipo: TipoSincronizacao) {
  let produtosImportados = 0;
  let pedidosImportados = 0;
  let avaliacoesImportadas = 0;
  let financeiroImportado = 0;

  let pedidosCriados: any[] = [];

  if (tipo === "produtos" || tipo === "geral") {
    const produtos = [
      {
        loja_id: lojaId,
        marketplace: "shopee",
        sku: `SHOPEE-${Date.now()}-001`,
        nome: "Produto Teste Shopee 01",
        preco: 49.9,
        custo: 25.0,
        estoque: 30,
        status: "ativo",
      },
      {
        loja_id: lojaId,
        marketplace: "shopee",
        sku: `SHOPEE-${Date.now()}-002`,
        nome: "Produto Teste Shopee 02",
        preco: 79.9,
        custo: 40.0,
        estoque: 15,
        status: "ativo",
      },
      {
        loja_id: lojaId,
        marketplace: "shopee",
        sku: `SHOPEE-${Date.now()}-003`,
        nome: "Produto Teste Shopee 03",
        preco: 129.9,
        custo: 70.0,
        estoque: 8,
        status: "ativo",
      },
    ];

    const { data, error } = await supabase
      .from("produtos")
      .insert(produtos)
      .select();

    if (error) throw error;

    produtosImportados = data?.length || 0;
  }

  if (tipo === "pedidos" || tipo === "financeiro" || tipo === "geral") {
    const pedidos = [
      {
        loja_id: lojaId,
        marketplace: "shopee",
        pedido_externo_id: `SH-${Date.now()}-001`,
        cliente_nome: "Cliente Teste 01",
        valor_total: 49.9,
        status: "pago",
        data_pedido: new Date().toISOString(),
      },
      {
        loja_id: lojaId,
        marketplace: "shopee",
        pedido_externo_id: `SH-${Date.now()}-002`,
        cliente_nome: "Cliente Teste 02",
        valor_total: 79.9,
        status: "enviado",
        data_pedido: new Date().toISOString(),
      },
      {
        loja_id: lojaId,
        marketplace: "shopee",
        pedido_externo_id: `SH-${Date.now()}-003`,
        cliente_nome: "Cliente Teste 03",
        valor_total: 129.9,
        status: "concluido",
        data_pedido: new Date().toISOString(),
      },
    ];

    const { data, error } = await supabase
      .from("pedidos")
      .insert(pedidos)
      .select();

    if (error) throw error;

    pedidosCriados = data || [];

    if (tipo === "pedidos" || tipo === "geral") {
      pedidosImportados = pedidosCriados.length;
    }
  }

  if (tipo === "avaliacoes" || tipo === "geral") {
    const avaliacoes = [
      {
        loja_id: lojaId,
        nome_produto: "Produto Teste Shopee 01",
        nome_cliente: "Cliente Teste 01",
        avaliacao: 5,
        comentario: "Produto excelente, chegou rápido!",
      },
      {
        loja_id: lojaId,
        nome_produto: "Produto Teste Shopee 02",
        nome_cliente: "Cliente Teste 02",
        avaliacao: 4,
        comentario: "Gostei bastante do produto.",
      },
      {
        loja_id: lojaId,
        nome_produto: "Produto Teste Shopee 03",
        nome_cliente: "Cliente Teste 03",
        avaliacao: 5,
        comentario: "Compra perfeita, recomendo.",
      },
    ];

    const { data, error } = await supabase
      .from("avaliacoes")
      .insert(avaliacoes)
      .select();

    if (error) throw error;

    avaliacoesImportadas = data?.length || 0;
  }

  if (tipo === "financeiro" || tipo === "geral") {
    if (pedidosCriados.length === 0) {
      const { data: pedidosExistentes, error: pedidosError } = await supabase
        .from("pedidos")
        .select("*")
        .eq("loja_id", lojaId)
        .order("criado_em", { ascending: false })
        .limit(3);

      if (pedidosError) throw pedidosError;

      pedidosCriados = pedidosExistentes || [];
    }

    const financeiro = pedidosCriados.flatMap((pedido) => [
      {
        loja_id: lojaId,
        marketplace: "shopee",
        pedido_id: pedido.id,
        tipo: "receita",
        descricao: `Receita do pedido ${pedido.pedido_externo_id}`,
        valor: pedido.valor_total,
        data_movimento: new Date().toISOString(),
      },
      {
        loja_id: lojaId,
        marketplace: "shopee",
        pedido_id: pedido.id,
        tipo: "despesa",
        descricao: `Taxas do pedido ${pedido.pedido_externo_id}`,
        valor: Number(pedido.valor_total) * 0.18,
        data_movimento: new Date().toISOString(),
      },
    ]);

    if (financeiro.length > 0) {
      const { data, error } = await supabase
        .from("financeiro")
        .insert(financeiro)
        .select();

      if (error) throw error;

      financeiroImportado = data?.length || 0;
    }
  }

  return {
    produtosImportados,
    pedidosImportados,
    avaliacoesImportadas,
    financeiroImportado,
  };
}

async function importarRealShopee(lojaId: string, tipo: TipoSincronizacao) {
  let produtosImportados = 0;
  let pedidosImportados = 0;
  let avaliacoesImportadas = 0;
  let financeiroImportado = 0;

  if (tipo === "produtos" || tipo === "geral") {
    await buscarProdutosShopee({ lojaId });
  }

  if (tipo === "pedidos" || tipo === "geral") {
    await buscarPedidosShopee({ lojaId });
  }

  if (tipo === "avaliacoes" || tipo === "geral") {
    await buscarAvaliacoesShopee({ lojaId });
  }

  if (tipo === "financeiro" || tipo === "geral") {
    await buscarFinanceiroShopee({ lojaId });
  }

  return {
    produtosImportados,
    pedidosImportados,
    avaliacoesImportadas,
    financeiroImportado,
  };
}

export async function importarShopee({
  lojaId,
  tipo = "geral",
}: ImportadorParams) {
  const inicio = new Date();

  try {
    const temToken = await lojaTemToken(lojaId);

    const resultado = temToken
      ? await importarRealShopee(lojaId, tipo)
      : await importarFakeShopee(lojaId, tipo);

    const totalImportado =
      resultado.produtosImportados +
      resultado.pedidosImportados +
      resultado.avaliacoesImportadas +
      resultado.financeiroImportado;

    await supabase.from("sincronizacoes").insert({
      loja_id: lojaId,
      marketplace: "shopee",
      tipo,
      status: "sucesso",
      registros_importados: totalImportado,
      iniciado_em: inicio.toISOString(),
      finalizado_em: new Date().toISOString(),
      mensagem: temToken
        ? `Sincronização real Shopee (${tipo}) executada.`
        : `Sincronização fake Shopee (${tipo}) concluída. ${totalImportado} registros criados.`,
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
      marketplace: "shopee",
      tipo,
      modo: temToken ? "real" : "fake",
      ...resultado,
      totalImportado,
    };
  } catch (error) {
    await supabase.from("sincronizacoes").insert({
      loja_id: lojaId,
      marketplace: "shopee",
      tipo,
      status: "erro",
      registros_importados: 0,
      iniciado_em: inicio.toISOString(),
      finalizado_em: new Date().toISOString(),
      mensagem:
        error instanceof Error
          ? error.message
          : "Erro desconhecido ao sincronizar Shopee.",
    });

    return {
      sucesso: false,
      marketplace: "shopee",
      tipo,
      erro:
        error instanceof Error
          ? error.message
          : "Erro desconhecido ao sincronizar Shopee.",
    };
  }
}