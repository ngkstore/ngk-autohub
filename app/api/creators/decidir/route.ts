import { NextRequest, NextResponse } from "next/server";
import { escopoDoUsuario, podeVerLoja } from "@/lib/conta";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// Fase 1: só REGISTRA a decisão humana (aprovar / recusar / adiar) no AutoHub. Nada vai para o TikTok.
//   POST { loja_id, amostra_id, decisao: "aprovar" | "recusar" | "adiar", observacao? }
export async function POST(request: NextRequest) {
  const escopo = await escopoDoUsuario();
  let b: { loja_id?: string; amostra_id?: string; decisao?: string; observacao?: string };
  try {
    b = await request.json();
  } catch {
    return NextResponse.json({ sucesso: false, erro: "JSON inválido." }, { status: 400 });
  }
  if (!b.loja_id || !b.amostra_id || !["aprovar", "recusar", "adiar"].includes(String(b.decisao))) return NextResponse.json({ sucesso: false, erro: "Dados incompletos." }, { status: 400 });
  if (!podeVerLoja(escopo, b.loja_id)) return NextResponse.json({ sucesso: false, erro: "Sem acesso à loja." }, { status: 403 });
  const { error } = await supabase
    .from("tiktok_amostras")
    .update({ decisao: b.decisao, decidido_por: escopo.email ?? "equipe", decidido_em: new Date().toISOString(), atualizado_em: new Date().toISOString() })
    .eq("loja_id", b.loja_id)
    .eq("amostra_id", b.amostra_id);
  if (error) return NextResponse.json({ sucesso: false, erro: error.message }, { status: 500 });
  return NextResponse.json({ sucesso: true, aviso: "Decisão registrada só no AutoHub; aprove ou recuse no Affiliate Center (ações pela API desligadas)." });
}
