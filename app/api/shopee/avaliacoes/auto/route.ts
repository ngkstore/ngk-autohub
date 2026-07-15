import { NextRequest, NextResponse } from "next/server";
import { escopoDoUsuario } from "@/lib/conta";
import { getFlagConta, setFlagConta } from "@/lib/flags";

export const dynamic = "force-dynamic";

const CHAVE = "responder_avaliacoes_ativo";

export async function GET() {
  const escopo = await escopoDoUsuario();
  if (!escopo.contaId) return NextResponse.json({ ativo: false });
  const ativo = await getFlagConta(CHAVE, escopo.contaId);
  return NextResponse.json({ ativo });
}

export async function POST(request: NextRequest) {
  try {
    const escopo = await escopoDoUsuario();
    if (!escopo.contaId) {
      return NextResponse.json(
        { sucesso: false, erro: "Usuário sem conta." },
        { status: 400 }
      );
    }
    const body = await request.json();
    if (typeof body?.ativo === "boolean") {
      await setFlagConta(CHAVE, escopo.contaId, body.ativo);
    }
    const ativo = await getFlagConta(CHAVE, escopo.contaId);
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
