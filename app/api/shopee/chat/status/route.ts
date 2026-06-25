import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { count: total } = await supabase
      .from("chat_conversas")
      .select("conversation_id", { count: "exact", head: true });

    const { count: pendentes } = await supabase
      .from("chat_conversas")
      .select("conversation_id", { count: "exact", head: true })
      .eq("precisa_resposta", true);

    const { count: comUnread } = await supabase
      .from("chat_conversas")
      .select("conversation_id", { count: "exact", head: true })
      .gt("unread_count", 0);

    const { data: recentes } = await supabase
      .from("chat_conversas")
      .select(
        "to_name, precisa_resposta, unread_count, ultima_mensagem, latest_message_id, ultimo_tratado_msg_id, escalada"
      )
      .order("ultima_mensagem_ts", { ascending: false })
      .limit(8);

    return NextResponse.json({
      sucesso: true,
      total: total ?? 0,
      precisa_resposta: pendentes ?? 0,
      com_unread: comUnread ?? 0,
      amostra_recentes: recentes ?? [],
    });
  } catch (error) {
    return NextResponse.json(
      {
        sucesso: false,
        erro: error instanceof Error ? error.message : "Erro ao obter status.",
      },
      { status: 500 }
    );
  }
}
