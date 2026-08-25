import { NextRequest, NextResponse } from "next/server";
import { enriquecerEscrowPendentes } from "@/lib/shopee/enriquecerEscrow";
import { escopoDoUsuario } from "@/lib/conta";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// lojaIds null = todas as lojas (cron). [...] = só as lojas da conta (usuário).
async function enriquecer(limite: number, lojaIds: string[] | null, reconferir = false) {
  try {
    const resultado = await enriquecerEscrowPendentes({ limite, lojaIds, reconferir });

    return NextResponse.json({
      sucesso: true,
      mensagem:
        resultado.processados === 0
          ? "Nenhum pedido pendente de conciliação."
          : `${resultado.atualizados} pedido(s) conciliado(s). Faltam ${resultado.restantes}.`,
      ...resultado,
    });
  } catch (error) {
    return NextResponse.json(
      {
        sucesso: false,
        erro:
          error instanceof Error
            ? error.message
            : "Erro desconhecido ao conciliar pedidos.",
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  // Cron da Vercel: processa TODAS as lojas (lojaIds = null).
  // ?reconferir=1 -> re-puxa o escrow de pedidos 32+ dias (afiliado tardio).
  const limite = Number(request.nextUrl.searchParams.get("limite")) || 200;
  const reconferir = request.nextUrl.searchParams.get("reconferir") === "1";
  return enriquecer(limite, null, reconferir);
}

export async function POST(request: NextRequest) {
  let limite = 150;
  try {
    const body = await request.json();
    if (body?.limite) limite = Number(body.limite);
  } catch {
    // usa o padrão
  }
  // Usuário pela tela: só as lojas da conta dele (admin = todas).
  const escopo = await escopoDoUsuario();
  const lojaIds = escopo.admin ? null : escopo.lojaIds;
  return enriquecer(limite, lojaIds);
}
