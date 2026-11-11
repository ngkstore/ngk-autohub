import { NextRequest, NextResponse } from "next/server";
import { escopoDoUsuario } from "@/lib/conta";
import { supabase } from "@/lib/supabase";
import { setFlagConta, getFlagConta } from "@/lib/flags";

export const dynamic = "force-dynamic";

const MODOS = ["sugerir", "aprovar", "automatico"];
const CHAVE_MODO_ASSISTENTE = "devolucoes_modo_assistente"; // sugerir | aprovar (automatico não existe para o assistente)

// Regras da conta (globais conta_id null + da conta) e modo do assistente.
export async function GET() {
  const escopo = await escopoDoUsuario();
  if (!escopo.contaId) return NextResponse.json({ sucesso: false, erro: "Sem conta." }, { status: 403 });
  const { data } = await supabase.from("regras_devolucao").select("*").or(`conta_id.eq.${escopo.contaId},conta_id.is.null`).order("ordem");
  const modoAprova = await getFlagConta(CHAVE_MODO_ASSISTENTE, escopo.contaId);
  return NextResponse.json({ sucesso: true, regras: data || [], modo_assistente: modoAprova ? "aprovar" : "sugerir" });
}

// POST { id, ativa? , modo?, ordem?, nome?, condicao?, acao? }  → edita (cria cópia na conta se for global)
// POST { nova: { nome, condicao, acao, modo, ordem } }         → cria
// POST { modo_assistente: "sugerir"|"aprovar" }
// POST { apagar: id }
export async function POST(request: NextRequest) {
  const escopo = await escopoDoUsuario();
  if (!escopo.contaId || !escopo.admin) return NextResponse.json({ sucesso: false, erro: "Só o administrador da conta." }, { status: 403 });
  let b: Record<string, unknown>;
  try {
    b = await request.json();
  } catch {
    return NextResponse.json({ sucesso: false, erro: "JSON inválido." }, { status: 400 });
  }
  if (typeof b.modo_assistente === "string") {
    await setFlagConta(CHAVE_MODO_ASSISTENTE, escopo.contaId, b.modo_assistente === "aprovar");
    return NextResponse.json({ sucesso: true });
  }
  if (typeof b.apagar === "string") {
    await supabase.from("regras_devolucao").delete().eq("id", b.apagar).eq("conta_id", escopo.contaId);
    return NextResponse.json({ sucesso: true });
  }
  if (b.nova && typeof b.nova === "object") {
    const n = b.nova as Record<string, unknown>;
    const { data, error } = await supabase.from("regras_devolucao").insert({ conta_id: escopo.contaId, nome: String(n.nome || "Nova regra"), condicao: n.condicao ?? {}, acao: n.acao ?? {}, modo: MODOS.includes(String(n.modo)) ? n.modo : "sugerir", ordem: Number(n.ordem) || 100, ativa: false }).select("id").single();
    if (error) return NextResponse.json({ sucesso: false, erro: error.message }, { status: 500 });
    return NextResponse.json({ sucesso: true, id: data.id });
  }
  if (typeof b.id !== "string") return NextResponse.json({ sucesso: false, erro: "Informe a regra." }, { status: 400 });
  const { data: r } = await supabase.from("regras_devolucao").select("*").eq("id", b.id).maybeSingle();
  if (!r) return NextResponse.json({ sucesso: false, erro: "Regra não encontrada." }, { status: 404 });
  const patch: Record<string, unknown> = {};
  if (typeof b.ativa === "boolean") patch.ativa = b.ativa;
  if (MODOS.includes(String(b.modo))) patch.modo = b.modo;
  if (b.ordem !== undefined) patch.ordem = Number(b.ordem) || r.ordem;
  if (typeof b.nome === "string") patch.nome = b.nome;
  if (b.condicao && typeof b.condicao === "object") patch.condicao = b.condicao;
  if (b.acao && typeof b.acao === "object") patch.acao = b.acao;
  patch.atualizado_em = new Date().toISOString();
  if (r.conta_id === null) {
    // regra global (semente, desligada): vira uma cópia da conta; a global não muda
    const { data, error } = await supabase.from("regras_devolucao").insert({ conta_id: escopo.contaId, nome: r.nome, condicao: r.condicao, acao: r.acao, modo: r.modo, ordem: r.ordem, ativa: r.ativa, ...patch }).select("id").single();
    if (error) return NextResponse.json({ sucesso: false, erro: error.message }, { status: 500 });
    return NextResponse.json({ sucesso: true, id: data.id, copiada: true });
  }
  const { error } = await supabase.from("regras_devolucao").update(patch).eq("id", r.id);
  if (error) return NextResponse.json({ sucesso: false, erro: error.message }, { status: 500 });
  return NextResponse.json({ sucesso: true, id: r.id });
}
