import { NextRequest, NextResponse } from "next/server";
import { escopoDoUsuario } from "@/lib/conta";
import { getFlagConta, setFlagConta } from "@/lib/flags";

export const dynamic = "force-dynamic";

const CHAVE_ATIVO = "responder_chat_ativo";
const CHAVE_AUTONOMO = "responder_chat_autonomo";

export async function GET() {
  const escopo = await escopoDoUsuario();
  if (!escopo.contaId) {
    return NextResponse.json({ ativo: false, autonomo: false });
  }
  const [ativo, autonomo] = await Promise.all([
    getFlagConta(CHAVE_ATIVO, escopo.contaId),
    getFlagConta(CHAVE_AUTONOMO, escopo.contaId),
  ]);
  return NextResponse.json({ ativo, autonomo });
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
      await setFlagConta(CHAVE_ATIVO, escopo.contaId, body.ativo);
    }
    if (typeof body?.autonomo === "boolean") {
      await setFlagConta(CHAVE_AUTONOMO, escopo.contaId, body.autonomo);
    }

    const [ativo, autonomo] = await Promise.all([
      getFlagConta(CHAVE_ATIVO, escopo.contaId),
      getFlagConta(CHAVE_AUTONOMO, escopo.contaId),
    ]);
    return NextResponse.json({ sucesso: true, ativo, autonomo });
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
