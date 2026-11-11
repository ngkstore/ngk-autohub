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
  // Devoluções (B8): casos que vencem em 24 h e em 4 h.
  const em24h = new Date(Date.now() + 24 * 3600000).toISOString();
  const { data: devolucoes } = await supabase
    .from("devolucoes")
    .select("id, loja_id, canal, plataforma_id, prazo_resposta, valor_reembolso_pedido")
    .in("etapa", ["resposta", "decisao", "recebido"])
    .lte("prazo_resposta", em24h)
    .limit(20);
  for (const d of devolucoes || []) {
    const horas = (new Date(d.prazo_resposta as string).getTime() - Date.now()) / 3600000;
    const { data: existe } = await supabase.from("alertas").select("id").eq("tipo", "devolucao").eq("status", "novo").ilike("descricao", `%${d.plataforma_id}%`).limit(1).maybeSingle();
    if (existe) continue;
    await criarAlerta({
      lojaId: d.loja_id,
      tipo: "devolucao",
      titulo: horas <= 4 ? "Devolução vence em menos de 4 h" : "Devolução vence em 24 h",
      descricao: `${d.canal} ${d.plataforma_id}: R$ ${Number(d.valor_reembolso_pedido || 0).toFixed(2)} — responder em /devolucoes/${d.id}`,
    });
  }

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