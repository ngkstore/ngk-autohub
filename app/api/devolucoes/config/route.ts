import { NextRequest, NextResponse } from "next/server";
import { escopoDoUsuario } from "@/lib/conta";
import { configDevolucoes, salvarConfigDevolucoes } from "@/lib/devolucoes/config";

export const dynamic = "force-dynamic";

// Configurações do módulo de Devoluções da conta do usuário (admin da conta).
//   GET  → { acoes_api, email_disputa, limites }
//   POST { acoes_api?, email_disputa?, limites? }
export async function GET() {
  const escopo = await escopoDoUsuario();
  if (!escopo.contaId) return NextResponse.json({ sucesso: false, erro: "Sem conta." }, { status: 403 });
  return NextResponse.json({ sucesso: true, ...(await configDevolucoes(escopo.contaId)) });
}

export async function POST(request: NextRequest) {
  const escopo = await escopoDoUsuario();
  if (!escopo.contaId || !escopo.admin) return NextResponse.json({ sucesso: false, erro: "Só o administrador da conta." }, { status: 403 });
  let body: { acoes_api?: boolean; email_disputa?: string | null; limites?: Record<string, number> };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ sucesso: false, erro: "JSON inválido." }, { status: 400 });
  }
  await salvarConfigDevolucoes(escopo.contaId, body);
  return NextResponse.json({ sucesso: true, ...(await configDevolucoes(escopo.contaId)) });
}
