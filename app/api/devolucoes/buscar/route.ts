import { NextRequest, NextResponse } from "next/server";
import { escopoDoUsuario, filtroLojas } from "@/lib/conta";
import { buscarParaRecebimento } from "@/lib/devolucoes/consultas";

export const dynamic = "force-dynamic";

// Recebimento: bipe/busca por rastreio reverso, número do pedido ou id da devolução.
export async function GET(request: NextRequest) {
  const escopo = await escopoDoUsuario();
  const lojas = filtroLojas(escopo);
  const q = request.nextUrl.searchParams.get("q") || "";
  const lista = await buscarParaRecebimento(lojas, q);
  return NextResponse.json({ sucesso: true, resultados: lista.map((d) => ({ id: d.id, canal: d.canal, plataforma_id: d.plataforma_id, pedido_id: d.pedido_id, etapa: d.etapa, motivo: d.motivo_texto || d.motivo_codigo, itens: d.itens, rastreio: d.rastreio_reverso, chegou_em: d.chegou_em, loja: d.lojas?.apelido ?? null })) });
}
