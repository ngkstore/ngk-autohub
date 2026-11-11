import { NextRequest, NextResponse } from "next/server";
import { escopoDoUsuario, podeVerLoja } from "@/lib/conta";
import { supabase } from "@/lib/supabase";
import { pedirAprovacaoTelegram } from "@/lib/devolucoes/aprovacao";
import type { Acao } from "@/lib/devolucoes/validar";
import type { Sugestao } from "@/lib/devolucoes/assistente";

export const dynamic = "force-dynamic";

// Tela do caso → "Mandar para aprovação no Telegram" com a ação editada pelo usuário.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const escopo = await escopoDoUsuario();
  const { data: d } = await supabase.from("devolucoes").select("id, loja_id, canal, plataforma_id, pedido_id, motivo_codigo, texto_comprador, valor_reembolso_pedido, prazo_resposta, itens, sugestao").eq("id", id).maybeSingle();
  if (!d || !podeVerLoja(escopo, d.loja_id)) return NextResponse.json({ sucesso: false, erro: "Caso não encontrado." }, { status: 404 });
  let body: { acao?: Acao };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ sucesso: false, erro: "JSON inválido." }, { status: 400 });
  }
  if (!body.acao?.tipo) return NextResponse.json({ sucesso: false, erro: "Informe a ação." }, { status: 400 });
  const r = await pedirAprovacaoTelegram({ ...d, itens: d.itens as { nome: string | null; quantidade: number }[] | null, sugestao: d.sugestao as Sugestao | null }, body.acao, "assistente", `pedido por ${escopo.email ?? "equipe"}`);
  return NextResponse.json({ sucesso: true, ...r });
}
