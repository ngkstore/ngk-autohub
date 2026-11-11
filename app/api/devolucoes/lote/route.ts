import { NextRequest, NextResponse } from "next/server";
import { escopoDoUsuario, podeVerLoja } from "@/lib/conta";
import { supabase } from "@/lib/supabase";
import { acaoDaSugestao, pedirAprovacaoTelegram } from "@/lib/devolucoes/aprovacao";
import type { Sugestao } from "@/lib/devolucoes/assistente";

export const dynamic = "force-dynamic";

// Fila → "Aplicar sugestões selecionadas": cada caso vira um pedido de aprovação no Telegram.
export async function POST(request: NextRequest) {
  const escopo = await escopoDoUsuario();
  let body: { ids?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ sucesso: false, erro: "JSON inválido." }, { status: 400 });
  }
  const ids = (body.ids || []).slice(0, 50);
  if (!ids.length) return NextResponse.json({ sucesso: false, erro: "Nada selecionado." }, { status: 400 });
  const { data } = await supabase.from("devolucoes").select("id, loja_id, canal, plataforma_id, pedido_id, motivo_codigo, texto_comprador, valor_reembolso_pedido, prazo_resposta, itens, sugestao").in("id", ids);
  let pedidas = 0;
  for (const d of data || []) {
    if (!podeVerLoja(escopo, d.loja_id)) continue;
    const s = d.sugestao as Sugestao | null;
    if (!s || s.decisao === "aguardar") continue;
    const r = await pedirAprovacaoTelegram({ ...d, itens: d.itens as { nome: string | null; quantidade: number }[] | null, sugestao: s }, acaoDaSugestao(s), "assistente");
    if (r.enviado) pedidas++;
  }
  return NextResponse.json({ sucesso: true, pedidas });
}
