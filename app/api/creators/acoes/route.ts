import { NextRequest, NextResponse } from "next/server";
import { escopoDoUsuario, podeVerLoja } from "@/lib/conta";
import { supabase } from "@/lib/supabase";
import { creatorsAcoesLigadas } from "@/lib/creators/config";

export const dynamic = "force-dynamic";

// FASE 2 — DESLIGADA (flag creators_acoes_api = false). Nenhum endpoint de escrita do TikTok é chamado
// enquanto a flag estiver desligada; quando o Gabriel ligar, toda ação exige confirmação na tela
// (confirmado: true) e fica registrada com quem aprovou em creators_acoes_log.
//   POST { loja_id, acao: "review_amostra" | "colaboracao_direcionada" | "mensagem", confirmado: true, ... }
const ENDPOINTS: Record<string, { path: (p: Record<string, string>) => string; method: "POST" | "PUT" }> = {
  review_amostra: { path: (p) => `/affiliate_seller/202508/sample_applications/${p.amostra_id}/review`, method: "POST" },
  colaboracao_direcionada: { path: () => `/affiliate_seller/202406/target_collaborations`, method: "POST" },
  mensagem: { path: (p) => `/affiliate_seller/202412/conversations/${p.conversa_id}/messages`, method: "POST" },
};

export async function POST(request: NextRequest) {
  const escopo = await escopoDoUsuario();
  let b: { loja_id?: string; acao?: string; confirmado?: boolean; params?: Record<string, string>; body?: unknown };
  try {
    b = await request.json();
  } catch {
    return NextResponse.json({ sucesso: false, erro: "JSON inválido." }, { status: 400 });
  }
  if (!b.loja_id || !b.acao || !ENDPOINTS[b.acao]) return NextResponse.json({ sucesso: false, erro: "Ação desconhecida." }, { status: 400 });
  if (!podeVerLoja(escopo, b.loja_id) || !escopo.contaId) return NextResponse.json({ sucesso: false, erro: "Sem acesso." }, { status: 403 });
  const ligada = await creatorsAcoesLigadas(escopo.contaId);
  if (!ligada) {
    return NextResponse.json({ sucesso: false, erro: "Ações pela API estão DESLIGADAS (flag creators_acoes_api). Fase 1: decida no Affiliate Center." }, { status: 403 });
  }
  if (b.confirmado !== true) return NextResponse.json({ sucesso: false, erro: "Confirme a ação na tela antes de enviar." }, { status: 400 });
  // Registro de quem aprovou ANTES de qualquer chamada; a chamada em si fica para a implementação da fase 2.
  await supabase.from("creators_acoes_log").insert({ loja_id: b.loja_id, acao: b.acao, params: b.params ?? null, aprovado_por: escopo.email ?? "equipe", status: "pendente_implementacao" }).then(() => null, () => null);
  return NextResponse.json({ sucesso: false, erro: "Fase 2 ainda não implementada: a chamada ao TikTok não foi feita (registrado no log)." }, { status: 501 });
}
