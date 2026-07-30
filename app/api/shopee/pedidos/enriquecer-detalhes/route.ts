import { NextRequest, NextResponse } from "next/server";
import { enriquecerPedidosPendentes } from "@/lib/shopee/enriquecerPedidos";
import { escopoDoUsuario } from "@/lib/conta";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// lojaIds null = todas as lojas (cron). [...] = só as lojas da conta (usuário).
async function enriquecer(limite: number, lojaIds: string[] | null) {
  try {
    const resultado = await enriquecerPedidosPendentes({ limite, lojaIds });

    return NextResponse.json({
      sucesso: true,
      mensagem:
        resultado.processados === 0
          ? "Nenhum pedido pendente de enriquecimento."
          : `${resultado.atualizados} pedido(s) enriquecido(s). Faltam ${resultado.restantes}.`,
      ...resultado,
    });
  } catch (error) {
    return NextResponse.json(
      {
        sucesso: false,
        erro:
          error instanceof Error
            ? error.message
            : "Erro desconhecido ao enriquecer pedidos.",
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  // Cron da Vercel: processa TODAS as lojas (lojaIds = null).
  const limite = Number(request.nextUrl.searchParams.get("limite")) || 1000;
  return enriquecer(limite, null);
}

export async function POST(request: NextRequest) {
  let limite = 300;
  try {
    const body = await request.json();
    if (body?.limite) limite = Number(body.limite);
  } catch {
    // sem corpo — usa o padrão
  }
  // Usuário pela tela: só as lojas da conta dele (admin = todas).
  const escopo = await escopoDoUsuario();
  const lojaIds = escopo.admin ? null : escopo.lojaIds;
  return enriquecer(limite, lojaIds);
}
