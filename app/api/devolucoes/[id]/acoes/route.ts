import { NextRequest, NextResponse } from "next/server";
import { escopoDoUsuario, podeVerLoja } from "@/lib/conta";
import { acoesPermitidas, carregarDevolucao, executar } from "@/lib/devolucoes/acoes";
import type { Acao } from "@/lib/devolucoes/validar";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// B3 — ações de um caso.
//   GET  /api/devolucoes/<id>/acoes   → o que a plataforma permite agora + motivos oficiais
//   POST /api/devolucoes/<id>/acoes   { acao: Acao }  → executa como "aprovado" pelo usuário logado
// Sempre atrás da flag devolucoes_acoes_api (desligada: responde precisaAprovacao/motivo, nada é enviado).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const escopo = await escopoDoUsuario();
  const d = await carregarDevolucao(id);
  if (!d || !podeVerLoja(escopo, d.loja_id)) return NextResponse.json({ sucesso: false, erro: "Caso não encontrado." }, { status: 404 });
  try {
    const p = await acoesPermitidas(d);
    return NextResponse.json({ sucesso: true, ...p });
  } catch (e) {
    return NextResponse.json({ sucesso: false, erro: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const escopo = await escopoDoUsuario();
  const d = await carregarDevolucao(id);
  if (!d || !podeVerLoja(escopo, d.loja_id)) return NextResponse.json({ sucesso: false, erro: "Caso não encontrado." }, { status: 404 });
  let body: { acao?: Acao; aprovacaoId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ sucesso: false, erro: "JSON inválido." }, { status: 400 });
  }
  if (!body.acao?.tipo) return NextResponse.json({ sucesso: false, erro: "Informe a ação." }, { status: 400 });
  const r = await executar(d, body.acao, { modo: "aprovado", aprovacaoId: body.aprovacaoId, decididoPor: escopo.email ?? undefined });
  return NextResponse.json({ sucesso: r.ok, ...r });
}
