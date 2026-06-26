import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// Mostra o contexto real que o robô monta para uma conversa:
// produto linkado? descrição preenchida? histórico de Q&A? conversa completa?
// Use ?conversation_id=XXX, ou deixe em branco para pegar a 1ª pendente.
export async function GET(request: NextRequest) {
  try {
    const convId = request.nextUrl.searchParams.get("conversation_id");

    let conversa;
    if (convId) {
      const { data } = await supabase
        .from("chat_conversas")
        .select("conversation_id, to_name, item_id, ultima_mensagem")
        .eq("conversation_id", convId)
        .maybeSingle();
      conversa = data;
    } else {
      const { data } = await supabase
        .from("chat_conversas")
        .select("conversation_id, to_name, item_id, ultima_mensagem")
        .eq("precisa_resposta", true)
        .order("ultima_mensagem_ts", { ascending: false })
        .limit(1)
        .maybeSingle();
      conversa = data;
    }

    if (!conversa) {
      return NextResponse.json({ sucesso: false, erro: "Nenhuma conversa encontrada." });
    }

    // item_id da conversa, ou inferido pelo pedido recente do cliente.
    let itemId: number | null = conversa.item_id ?? null;
    let itemInferido = false;
    if (!itemId && conversa.to_name) {
      const { data: ped } = await supabase
        .from("pedidos")
        .select("dados_pedido")
        .eq("marketplace", "shopee")
        .eq("cliente_nome", conversa.to_name)
        .order("data_pedido", { ascending: false })
        .limit(1)
        .maybeSingle();
      const itens = (
        ped?.dados_pedido as { item_list?: { item_id?: number }[] } | null
      )?.item_list;
      if (Array.isArray(itens) && itens[0]?.item_id) {
        itemId = Number(itens[0].item_id);
        itemInferido = true;
      }
    }

    // Produto + descrição
    let produto: { nome?: string; descricao?: string } | null = null;
    if (itemId) {
      const { data } = await supabase
        .from("produtos")
        .select("nome, descricao")
        .eq("item_id", itemId)
        .maybeSingle();
      produto = data;
    }

    // Histórico de Q&A do produto
    let historico: { de_loja: boolean; texto: string }[] = [];
    if (itemId) {
      const { data } = await supabase
        .from("chat_mensagens")
        .select("de_loja, texto")
        .eq("item_id", itemId)
        .not("texto", "is", null)
        .neq("texto", "")
        .order("created_timestamp", { ascending: false })
        .limit(16);
      historico = data || [];
    }

    // Conversa completa (thread)
    const { data: thread } = await supabase
      .from("chat_mensagens")
      .select("de_loja, texto, created_timestamp")
      .eq("conversation_id", conversa.conversation_id)
      .not("texto", "is", null)
      .neq("texto", "")
      .order("created_timestamp", { ascending: true })
      .limit(40);

    const descricao = produto?.descricao || "";

    return NextResponse.json({
      sucesso: true,
      conversation_id: conversa.conversation_id,
      cliente: conversa.to_name,
      item_id: itemId,
      tem_item_id: !!itemId,
      item_inferido_do_pedido: itemInferido,
      produto_nome: produto?.nome || null,
      descricao_tem: descricao.length > 0,
      descricao_tamanho: descricao.length,
      descricao_preview: descricao.slice(0, 300),
      historico_qtd: historico.length,
      historico_preview: historico
        .slice(0, 6)
        .map((m) => `${m.de_loja ? "Loja" : "Cliente"}: ${(m.texto || "").slice(0, 80)}`),
      thread_qtd: (thread || []).length,
      thread: (thread || []).map(
        (m) => `${m.de_loja ? "Loja" : "Cliente"}: ${m.texto}`
      ),
    });
  } catch (error) {
    return NextResponse.json(
      { sucesso: false, erro: error instanceof Error ? error.message : "Erro." },
      { status: 500 }
    );
  }
}
