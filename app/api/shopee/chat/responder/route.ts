import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { responderChatsLote } from "@/lib/shopee/responderChats";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const CHAVE_ATIVO = "responder_chat_ativo";

// POST: manual. { limite, enviar }. enviar=false (padrão) = só gera p/ revisão.
export async function POST(request: NextRequest) {
  let limite = 5;
  let enviar = false;
  try {
    const body = await request.json();
    if (body?.limite) limite = Number(body.limite);
    if (typeof body?.enviar === "boolean") enviar = body.enviar;
  } catch {
    // padrão
  }

  try {
    const r = await responderChatsLote({ limite, enviar });
    return NextResponse.json({ sucesso: !r.erro, enviar, ...r });
  } catch (error) {
    return NextResponse.json(
      {
        sucesso: false,
        erro: error instanceof Error ? error.message : "Erro ao responder chat.",
      },
      { status: 500 }
    );
  }
}

// GET: cron. Só responde de verdade se o robô estiver ligado.
export async function GET() {
  try {
    const { data: cfg } = await supabase
      .from("configuracoes")
      .select("valor")
      .eq("chave", CHAVE_ATIVO)
      .maybeSingle();

    if (cfg?.valor !== "true") {
      return NextResponse.json({ sucesso: true, idle: true, motivo: "robô desligado" });
    }

    const r = await responderChatsLote({ limite: 15, enviar: true });
    return NextResponse.json({ sucesso: !r.erro, ...r });
  } catch (error) {
    return NextResponse.json(
      {
        sucesso: false,
        erro: error instanceof Error ? error.message : "Erro ao responder chat.",
      },
      { status: 500 }
    );
  }
}
