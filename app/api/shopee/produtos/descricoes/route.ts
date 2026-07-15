import { NextRequest, NextResponse } from "next/server";
import { enriquecerDescricoesPendentes } from "@/lib/shopee/enriquecerProdutos";
import {
  listarLojasShopeeAtivas,
  lojasShopeeDoEscopo,
  type LojaShopee,
} from "@/lib/shopee/lojas";
import { escopoDoUsuario } from "@/lib/conta";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function rodar(limite: number, lojas: LojaShopee[]) {
  try {
    const resultados = [];
    for (const loja of lojas) {
      resultados.push({
        lojaId: loja.lojaId,
        ...(await enriquecerDescricoesPendentes({ loja, limite })),
      });
    }
    const restantes = resultados.reduce((s, r) => s + (r.restantes || 0), 0);
    const atualizados = resultados.reduce((s, r) => s + (r.atualizados || 0), 0);
    return NextResponse.json({
      sucesso: true,
      mensagem: `${atualizados} descrição(ões) atualizada(s). Faltam ${restantes}.`,
      lojas: resultados,
    });
  } catch (error) {
    return NextResponse.json(
      {
        sucesso: false,
        erro:
          error instanceof Error
            ? error.message
            : "Erro ao buscar descrições.",
      },
      { status: 500 }
    );
  }
}

// GET: cron -> todas as lojas.
export async function GET(request: NextRequest) {
  const limite = Number(request.nextUrl.searchParams.get("limite")) || 200;
  return rodar(limite, await listarLojasShopeeAtivas());
}

// POST: manual -> só as lojas da conta do usuário.
export async function POST(request: NextRequest) {
  let limite = 200;
  try {
    const body = await request.json();
    if (body?.limite) limite = Number(body.limite);
  } catch {
    // padrão
  }
  const escopo = await escopoDoUsuario();
  return rodar(limite, await lojasShopeeDoEscopo(escopo));
}
