import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const CHAVE_ATIVO = "responder_chat_ativo";
const CHAVE_AUTONOMO = "responder_chat_autonomo";

async function setConfig(chave: string, valor: string) {
  const { data } = await supabase
    .from("configuracoes")
    .select("chave")
    .eq("chave", chave)
    .maybeSingle();
  if (data) {
    await supabase
      .from("configuracoes")
      .update({ valor, atualizado_em: new Date().toISOString() })
      .eq("chave", chave);
  } else {
    await supabase
      .from("configuracoes")
      .insert({ chave, valor, atualizado_em: new Date().toISOString() });
  }
}

export async function GET() {
  const { data } = await supabase
    .from("configuracoes")
    .select("chave, valor")
    .in("chave", [CHAVE_ATIVO, CHAVE_AUTONOMO]);
  const mapa: Record<string, string> = {};
  (data || []).forEach((c) => {
    mapa[c.chave] = c.valor;
  });
  return NextResponse.json({
    ativo: mapa[CHAVE_ATIVO] === "true",
    autonomo: mapa[CHAVE_AUTONOMO] === "true",
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (typeof body?.ativo === "boolean") {
      await setConfig(CHAVE_ATIVO, body.ativo ? "true" : "false");
    }
    if (typeof body?.autonomo === "boolean") {
      await setConfig(CHAVE_AUTONOMO, body.autonomo ? "true" : "false");
    }

    const { data } = await supabase
      .from("configuracoes")
      .select("chave, valor")
      .in("chave", [CHAVE_ATIVO, CHAVE_AUTONOMO]);
    const mapa: Record<string, string> = {};
    (data || []).forEach((c) => {
      mapa[c.chave] = c.valor;
    });

    return NextResponse.json({
      sucesso: true,
      ativo: mapa[CHAVE_ATIVO] === "true",
      autonomo: mapa[CHAVE_AUTONOMO] === "true",
    });
  } catch (error) {
    return NextResponse.json(
      {
        sucesso: false,
        erro: error instanceof Error ? error.message : "Erro ao salvar.",
      },
      { status: 500 }
    );
  }
}
