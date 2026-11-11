import { NextRequest, NextResponse } from "next/server";
import { escopoDoUsuario, filtroLojas } from "@/lib/conta";
import { montarPainel } from "@/lib/painel/pendencias";
import { pendenciasEstoque } from "@/lib/estoque/pendencias";
import { pendenciasCampanhas } from "@/lib/campanhas/pendencias";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Painel do dia (C1/C2): leitura para a tela e o botão "Atualizar".
export async function GET(request: NextRequest) {
  const escopo = await escopoDoUsuario();
  const lojas = filtroLojas(escopo, request.nextUrl.searchParams.get("loja") || undefined);
  const painel = await montarPainel(lojas, { estoque: () => pendenciasEstoque(lojas), campanhas: () => pendenciasCampanhas(lojas) });
  return NextResponse.json({ sucesso: true, ...painel });
}

