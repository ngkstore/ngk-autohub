import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { enviarMensagemChat } from "@/lib/shopee/chatSend";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const conversationId = String(body?.conversation_id || "");
    const acao = String(body?.acao || "");
    const textoCustom = typeof body?.texto === "string" ? body.texto : "";

    if (!conversationId || !acao) {
      return NextResponse.json(
        { sucesso: false, erro: "Parâmetros ausentes." },
        { status: 400 }
      );
    }

    const { data: conversa } = await supabase
      .from("chat_conversas")
      .select("to_id, resposta_ia")
      .eq("conversation_id", conversationId)
      .maybeSingle();

    if (!conversa) {
      return NextResponse.json(
        { sucesso: false, erro: "Conversa não encontrada." },
        { status: 404 }
      );
    }

    if (acao === "enviar") {
      const texto = textoCustom || conversa.resposta_ia;
      if (!texto) {
        return NextResponse.json(
          { sucesso: false, erro: "Sem texto para enviar." },
          { status: 400 }
        );
      }
      await enviarMensagemChat(String(conversa.to_id), texto);
      await supabase
        .from("chat_conversas")
        .update({
          precisa_resposta: false,
          escalada: false,
          ultimo_remetente: "loja",
          resposta_ia: texto,
          respondida_em: new Date().toISOString(),
        })
        .eq("conversation_id", conversationId);

      return NextResponse.json({ sucesso: true, acao: "enviar" });
    }

    if (acao === "resolver") {
      await supabase
        .from("chat_conversas")
        .update({ escalada: false, precisa_resposta: false })
        .eq("conversation_id", conversationId);

      return NextResponse.json({ sucesso: true, acao: "resolver" });
    }

    return NextResponse.json(
      { sucesso: false, erro: "Ação inválida." },
      { status: 400 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        sucesso: false,
        erro: error instanceof Error ? error.message : "Erro na ação.",
      },
      { status: 500 }
    );
  }
}
