import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const CHAVE = "responder_avaliacoes_ativo";

export async function GET() {
  const { data } = await supabase
    .from("configuracoes")
    .select("valor")
    .eq("chave", CHAVE)
    .maybeSingle();

  return NextResponse.json({ ativo: data?.valor === "true" });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const ativo = !!body?.ativo;
    const valor = ativo ? "true" : "false";

    const { data: existente } = await supabase
      .from("configuracoes")
      .select("chave")
      .eq("chave", CHAVE)
      .maybeSingle();

    if (existente) {
      await supabase
        .from("configuracoes")
        .update({ valor, atualizado_em: new Date().toISOString() })
        .eq("chave", CHAVE);
    } else {
      await supabase.from("configuracoes").insert({
        chave: CHAVE,
        valor,
        atualizado_em: new Date().toISOString(),
      });
    }

    return NextResponse.json({ sucesso: true, ativo });
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
