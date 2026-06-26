import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { responderChatsLote } from "@/lib/shopee/responderChats";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const CHAVE_ATIVO = "responder_chat_ativo";
const CHAVE_AUTONOMO = "responder_chat_autonomo";

// POST: manual. { limite, enviar, autonomo }. enviar=false = só gera p/ revisão.
export async function POST(request: NextRequest) {
  let limite = 5;
  let enviar = false;
  let autonomo = false;
  try {
    const body = await request.json();
    if (body?.limite) limite = Number(body.limite);
    if (typeof body?.enviar === "boolean") enviar = body.enviar;
    if (typeof body?.autonomo === "boolean") autonomo = body.autonomo;
  } catch {
    // padrão
  }

  try {
    const r = await responderChatsLote({ limite, enviar, autonomo });
    return NextResponse.json({ sucesso: !r.erro, enviar, autonomo, ...r });
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
    const { data: cfgs } = await supabase
      .from("configuracoes")
      .select("chave, valor")
      .in("chave", [CHAVE_ATIVO, CHAVE_AUTONOMO]);

    const mapa: Record<string, string> = {};
    (cfgs || []).forEach((c) => {
      mapa[c.chave] = c.valor;
    });

    if (mapa[CHAVE_ATIVO] !== "true") {
      return NextResponse.json({ sucesso: true, idle: true, motivo: "robô desligado" });
    }

    const autonomo = mapa[CHAVE_AUTONOMO] === "true";
    const r = await responderChatsLote({ limite: 15, enviar: true, autonomo });
    return NextResponse.json({ sucesso: !r.erro, autonomo, ...r });
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
