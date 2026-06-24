import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { responderAvaliacoesLote } from "@/lib/shopee/responderAvaliacoes";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const CHAVE_ATIVO = "responder_avaliacoes_ativo";
const POR_MINUTO = 20; // avaliações por minuto na janela ativa
const FIM_JANELA_ATIVA = 30; // minutos 0-29 = sprint; 30-59 = pausa

// POST: execução manual (teste). Body opcional { limite }.
export async function POST(request: NextRequest) {
  let limite = 5;
  try {
    const body = await request.json();
    if (body?.limite) limite = Number(body.limite);
  } catch {
    // usa padrão
  }

  try {
    const resultado = await responderAvaliacoesLote({ limite });
    return NextResponse.json({ sucesso: !resultado.erro, ...resultado });
  } catch (error) {
    return NextResponse.json(
      {
        sucesso: false,
        erro:
          error instanceof Error
            ? error.message
            : "Erro ao responder avaliações.",
      },
      { status: 500 }
    );
  }
}

// GET: usado pelo cron (a cada minuto). Só age se o robô estiver ligado e
// dentro da janela de sprint (primeiros 30 min de cada hora).
export async function GET() {
  try {
    const { data: cfg } = await supabase
      .from("configuracoes")
      .select("valor")
      .eq("chave", CHAVE_ATIVO)
      .maybeSingle();

    if (cfg?.valor !== "true") {
      return NextResponse.json({
        sucesso: true,
        idle: true,
        motivo: "robô desligado",
      });
    }

    const minuto = new Date().getUTCMinutes();
    if (minuto >= FIM_JANELA_ATIVA) {
      return NextResponse.json({
        sucesso: true,
        idle: true,
        motivo: "janela de pausa",
      });
    }

    const resultado = await responderAvaliacoesLote({ limite: POR_MINUTO });
    return NextResponse.json({ sucesso: !resultado.erro, ...resultado });
  } catch (error) {
    return NextResponse.json(
      {
        sucesso: false,
        erro:
          error instanceof Error
            ? error.message
            : "Erro ao responder avaliações.",
      },
      { status: 500 }
    );
  }
}
