import { NextRequest, NextResponse } from "next/server";
import { enriquecerPedidosPendentes } from "@/lib/shopee/enriquecerPedidos";
import { escopoDoUsuario } from "@/lib/conta";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Re-checa o status na Shopee dos pedidos presos em UNPAID (recentes 1o) e
// vira os que já pagaram para efetivado — corrigindo faturamento subcontado.
// O sync normal cobre só janelas de 15 min por create_time, então pagamentos
// tardios (horas/dias depois) nunca eram atualizados. Ver enriquecerPedidos.ts.
async function resync(limite: number, lojaIds: string[] | null) {
  try {
    const r = await enriquecerPedidosPendentes({ limite, lojaIds, resync: true });

    return NextResponse.json({
      sucesso: true,
      mensagem:
        r.processados === 0
          ? "Nenhum pedido UNPAID para re-checar."
          : `${r.processados} re-checados · ${r.viraramEfetivados ?? 0} viraram pago(s) · restam ${r.restantes} UNPAID.`,
      ...r,
    });
  } catch (error) {
    return NextResponse.json(
      {
        sucesso: false,
        erro:
          error instanceof Error
            ? error.message
            : "Erro desconhecido ao re-sincronizar status.",
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  // Cron da Vercel: todas as lojas (lojaIds = null).
  const limite = Number(request.nextUrl.searchParams.get("limite")) || 300;
  return resync(limite, null);
}

export async function POST(request: NextRequest) {
  let limite = 300;
  try {
    const body = await request.json();
    if (body?.limite) limite = Number(body.limite);
  } catch {
    // sem corpo — usa o padrão
  }
  const escopo = await escopoDoUsuario();
  const lojaIds = escopo.admin ? null : escopo.lojaIds;
  return resync(limite, lojaIds);
}
