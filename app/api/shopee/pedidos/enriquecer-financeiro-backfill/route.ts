import { NextRequest, NextResponse } from "next/server";
import { enriquecerEscrowPendentes } from "@/lib/shopee/enriquecerEscrow";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Drenador do ESCROW do backfill histórico: puxa taxa real + comissão de
// afiliado dos pedidos importados (origem='backfill') que já têm detalhe e ainda
// não têm escrow. Separado do cron ao vivo (que fica só com os do dia) pra
// acelerar o fechamento do ano sem starvar a operação. ?limite=N (padrão 150).
async function rodar(limite: number) {
  try {
    const r = await enriquecerEscrowPendentes({ limite, backfill: true });
    return NextResponse.json({
      sucesso: true,
      mensagem: `${r.atualizados} escrow(s) puxado(s). Faltam ${r.restantes}.`,
      ...r,
    });
  } catch (error) {
    return NextResponse.json(
      { sucesso: false, erro: error instanceof Error ? error.message : "Erro desconhecido." },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  const limite = Math.min(400, Math.max(1, Number(request.nextUrl.searchParams.get("limite")) || 150));
  return rodar(limite);
}

export async function POST(request: NextRequest) {
  const limite = Math.min(400, Math.max(1, Number(request.nextUrl.searchParams.get("limite")) || 150));
  return rodar(limite);
}
