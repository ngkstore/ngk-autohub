import { NextRequest, NextResponse } from "next/server";
import { enriquecerPedidosPendentes } from "@/lib/shopee/enriquecerPedidos";
import { autorizar } from "@/lib/autorizacao";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Revisão de status: re-puxa o status ATUAL de pedidos efetivados presos num
// status não-terminal (o sistema não re-sincronizava status de pedido antigo,
// então cancelamento tardio ficava contado como pago). Recentes primeiro.
// Atualiza SÓ status + flags (preserva valor/data do escrow). ?limite=N.
async function rodar(limite: number) {
  try {
    const r = await enriquecerPedidosPendentes({ limite, revisar: true });
    return NextResponse.json({
      sucesso: true,
      mensagem: `${r.atualizados} revisado(s). Faltam ${r.restantes}.`,
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
  // Cron (Bearer CRON_SECRET) ou usuário com acesso à loja; em lote só cron/admin.
  const autz = await autorizar(request);
  if (!autz.ok) return autz.resposta;
  const limite = Math.min(1000, Math.max(1, Number(request.nextUrl.searchParams.get("limite")) || 200));
  return rodar(limite);
}

export async function POST(request: NextRequest) {
  const limite = Math.min(1000, Math.max(1, Number(request.nextUrl.searchParams.get("limite")) || 200));
  return rodar(limite);
}
