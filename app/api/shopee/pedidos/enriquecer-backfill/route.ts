import { NextRequest, NextResponse } from "next/server";
import { enriquecerPedidosPendentes } from "@/lib/shopee/enriquecerPedidos";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Drenador do DETALHE do backfill histórico: pega só os pedidos importados
// (origem='backfill') que ainda estão sem detalhe (data_pedido null) e busca
// data/valor/itens via get_order_detail. Separado do cron ao vivo pra não
// atrasar o faturamento do dia. ?limite=N (padrão 300). Escrow (taxa real) fica
// por conta do cron financeiro normal, que já é recente-primeiro.
async function rodar(limite: number) {
  try {
    const r = await enriquecerPedidosPendentes({ limite, backfill: true });
    return NextResponse.json({
      sucesso: true,
      mensagem: `${r.atualizados} enriquecido(s). Faltam ${r.restantes}.`,
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
  const limite = Math.min(1000, Math.max(1, Number(request.nextUrl.searchParams.get("limite")) || 300));
  return rodar(limite);
}

export async function POST(request: NextRequest) {
  const limite = Math.min(1000, Math.max(1, Number(request.nextUrl.searchParams.get("limite")) || 300));
  return rodar(limite);
}
