import { NextRequest, NextResponse } from "next/server";
import { escopoDoUsuario, podeVerLoja } from "@/lib/conta";
import { supabase } from "@/lib/supabase";
import { carregarDevolucao } from "@/lib/devolucoes/acoes";

export const dynamic = "force-dynamic";

// B6 — "Marcar como creditado" escolhendo a transação da carteira/extrato. A primeira
// marcação registra o transaction_type encontrado como candidato para carteira_categorias.
//   GET  → transações positivas do pedido (candidatas)
//   POST { transacao_ref, valor?, tipo? }
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const escopo = await escopoDoUsuario();
  const d = await carregarDevolucao(id);
  if (!d || !podeVerLoja(escopo, d.loja_id)) return NextResponse.json({ sucesso: false, erro: "Caso não encontrado." }, { status: 404 });
  if (d.canal === "shopee") {
    const { data } = await supabase.from("carteira_transacoes").select("transaction_id, tipo, categoria, valor, criado_em, descricao").eq("loja_id", d.loja_id).eq("order_sn", d.pedido_id).order("criado_em", { ascending: false }).limit(20);
    return NextResponse.json({ sucesso: true, candidatas: (data || []).map((t) => ({ ref: t.transaction_id, tipo: t.tipo, categoria: t.categoria, valor: t.valor, quando: t.criado_em, descricao: t.descricao })) });
  }
  const { data } = await supabase.from("tiktok_transacoes").select("id, tipo, adjustment, settlement, revenue, order_create_time").eq("loja_id", d.loja_id).eq("order_id", d.pedido_id).limit(20);
  return NextResponse.json({ sucesso: true, candidatas: (data || []).map((t) => ({ ref: t.id, tipo: t.tipo, categoria: null, valor: t.adjustment || t.settlement, quando: t.order_create_time, descricao: null })) });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const escopo = await escopoDoUsuario();
  const d = await carregarDevolucao(id);
  if (!d || !podeVerLoja(escopo, d.loja_id)) return NextResponse.json({ sucesso: false, erro: "Caso não encontrado." }, { status: 404 });
  let b: { transacao_ref?: string; valor?: number; tipo?: string };
  try {
    b = await request.json();
  } catch {
    return NextResponse.json({ sucesso: false, erro: "JSON inválido." }, { status: 400 });
  }
  if (!b.transacao_ref) return NextResponse.json({ sucesso: false, erro: "Escolha a transação." }, { status: 400 });
  await supabase.from("devolucoes").update({ credito_status: "creditado", credito_transacao_ref: b.transacao_ref, creditado_em: new Date().toISOString(), valor_recuperado: b.valor ?? null }).eq("id", id);
  await supabase.from("devolucao_eventos").upsert({ devolucao_id: id, origem: "equipe", tipo: "credito_marcado", descricao: `Marcado como creditado por ${escopo.email ?? "equipe"} (ref ${b.transacao_ref}${b.tipo ? `, tipo ${b.tipo}` : ""}). Tipo candidato para carteira_categorias.`, dados: b, chave: `credito:${b.transacao_ref}` }, { onConflict: "devolucao_id,chave", ignoreDuplicates: true });
  return NextResponse.json({ sucesso: true });
}
