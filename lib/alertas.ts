import { supabase } from "@/lib/supabase";

async function criarAlerta({
  lojaId,
  tipo,
  titulo,
  descricao,
}: {
  lojaId?: string | null;
  tipo: string;
  titulo: string;
  descricao: string;
}) {
  await supabase.from("alertas").insert({
    loja_id: lojaId || null,
    tipo,
    titulo,
    descricao,
    status: "novo",
  });
}

export async function gerarAlertasAutomaticos() {
  const { data: produtosSemEstoque } = await supabase
    .from("produtos")
    .select("*")
    .lte("estoque", 0)
    .limit(10);

  for (const produto of produtosSemEstoque || []) {
    await criarAlerta({
      lojaId: produto.loja_id,
      tipo: "estoque",
      titulo: "Produto sem estoque",
      descricao: `${produto.nome} está com estoque zerado.`,
    });
  }

  const { data: avaliacoesRuins } = await supabase
    .from("avaliacoes")
    .select("*")
    .lte("avaliacao", 2)
    .order("criado_em", { ascending: false })
    .limit(10);

  for (const avaliacao of avaliacoesRuins || []) {
    await criarAlerta({
      lojaId: avaliacao.loja_id,
      tipo: "avaliacao",
      titulo: "Avaliação ruim recebida",
      descricao: `${avaliacao.nome_produto} recebeu nota ${avaliacao.avaliacao}.`,
    });
  }

  const { data: tokensExpirando } = await supabase
    .from("marketplace_tokens")
    .select("*")
    .lte("expira_em", new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString())
    .limit(10);

  for (const token of tokensExpirando || []) {
    await criarAlerta({
      lojaId: token.loja_id,
      tipo: "token",
      titulo: "Token próximo de expirar",
      descricao: `Token ${token.marketplace} está próximo do vencimento.`,
    });
  }

  const { data: sincronizacoesErro } = await supabase
    .from("sincronizacoes")
    .select("*")
    .eq("status", "erro")
    .order("criado_em", { ascending: false })
    .limit(10);

  for (const sync of sincronizacoesErro || []) {
    await criarAlerta({
      lojaId: sync.loja_id,
      tipo: "sincronizacao",
      titulo: "Erro de sincronização",
      descricao: sync.mensagem || "Uma sincronização falhou.",
    });
  }

  return {
    sucesso: true,
    mensagem: "Alertas automáticos gerados com sucesso.",
  };
}