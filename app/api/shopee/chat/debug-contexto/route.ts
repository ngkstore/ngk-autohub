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

    // Produto + descrição
    let produto: { nome?: string; descricao?: string } | null = null;
    if (conversa.item_id) {
      const { data } = await supabase
        .from("produtos")
        .select("nome, descricao")
        .eq("item_id", conversa.item_id)
        .maybeSingle();
      produto = data;
    }

    // Histórico de Q&A do produto
    let historico: { de_loja: boolean; texto: string }[] = [];
    if (conversa.item_id) {
      const { data } = await supabase
        .from("chat_mensagens")
        .select("de_loja, texto")
        .eq("item_id", conversa.item_id)
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
      item_id: conversa.item_id,
      tem_item_id: !!conversa.item_id,
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
