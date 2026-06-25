import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { enviarMensagemChat } from "@/lib/shopee/chatSend";
import {
  segredoWebhook,
  responderCallback,
  editarMensagem,
} from "@/lib/telegram";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  // Segurança: o Telegram envia o secret no header; só aceitamos o nosso.
  const secret = request.headers.get("x-telegram-bot-api-secret-token");
  if (!secret || secret !== segredoWebhook()) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  let update: {
    callback_query?: {
      id: string;
      data?: string;
      message?: { chat?: { id: number }; message_id?: number; text?: string };
    };
  };
  try {
    update = await request.json();
  } catch {
    return NextResponse.json({ ok: true });
  }

  const cq = update.callback_query;
  if (!cq?.data) return NextResponse.json({ ok: true });

  const [acao, conversationId] = cq.data.split(":");
  const chatId = cq.message?.chat?.id;
  const messageId = cq.message?.message_id;
  const textoOriginal = cq.message?.text || "";

  // Busca a conversa e a resposta sugerida pela IA.
  const { data: conversa } = await supabase
    .from("chat_conversas")
    .select("to_id, resposta_ia, latest_message_id")
    .eq("conversation_id", conversationId)
    .maybeSingle();

  if (!conversa) {
    await responderCallback(cq.id, "Conversa não encontrada.");
    return NextResponse.json({ ok: true });
  }

  if (acao === "ap") {
    // Aprovar: envia a sugestão da IA no chat da Shopee.
    if (!conversa.resposta_ia) {
      await responderCallback(cq.id, "Sem sugestão para enviar.");
      return NextResponse.json({ ok: true });
    }
    try {
      await enviarMensagemChat(String(conversa.to_id), conversa.resposta_ia);
      await supabase
        .from("chat_conversas")
        .update({
          precisa_resposta: false,
          escalada: false,
          ultimo_remetente: "loja",
          respondida_em: new Date().toISOString(),
        })
        .eq("conversation_id", conversationId);

      await responderCallback(cq.id, "Resposta enviada! ✅");
      if (chatId && messageId) {
        await editarMensagem(
          chatId,
          messageId,
          `${textoOriginal}\n\n✅ Resposta aprovada e enviada.`
        );
      }
    } catch (e) {
      await responderCallback(
        cq.id,
        e instanceof Error ? e.message.slice(0, 180) : "Erro ao enviar."
      );
    }
  } else if (acao === "rj") {
    // Você vai responder manualmente: só registra.
    await responderCallback(cq.id, "Ok! Responda pela Shopee.");
    if (chatId && messageId) {
      await editarMensagem(
        chatId,
        messageId,
        `${textoOriginal}\n\n✏️ Você vai responder pela Shopee.`
      );
    }
  } else {
    await responderCallback(cq.id, "Ação desconhecida.");
  }

  return NextResponse.json({ ok: true });
}
