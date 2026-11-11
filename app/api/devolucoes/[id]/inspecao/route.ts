import { NextRequest, NextResponse } from "next/server";
import { escopoDoUsuario, podeVerLoja } from "@/lib/conta";
import { supabase } from "@/lib/supabase";
import { carregarDevolucao } from "@/lib/devolucoes/acoes";

export const dynamic = "force-dynamic";

const ESTADOS = ["novo", "usado", "defeito", "diferente_ou_faltando"] as const;
const DESTINO: Record<(typeof ESTADOS)[number], "estoque" | "saldo" | "avaria" | "contestacao"> = { novo: "estoque", usado: "saldo", defeito: "avaria", diferente_ou_faltando: "contestacao" };

// B5 — grava a inspeção do pacote recebido (peso, checklist, estado → destino, observação,
// NF-e/UpSeller) e as tarefas derivadas. A etapa do caso vai para `inspecao`.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const escopo = await escopoDoUsuario();
  const d = await carregarDevolucao(id);
  if (!d || !podeVerLoja(escopo, d.loja_id)) return NextResponse.json({ sucesso: false, erro: "Caso não encontrado." }, { status: 404 });
  let b: { peso_envio_kg?: number | null; peso_chegada_kg?: number | null; itens?: unknown; estado?: string; observacao?: string; nfe_numero?: string; nfe_data?: string; ajuste_upseller_feito?: boolean; chegou?: boolean; concluir?: boolean };
  try {
    b = await request.json();
  } catch {
    return NextResponse.json({ sucesso: false, erro: "JSON inválido." }, { status: 400 });
  }
  const estado = ESTADOS.includes(b.estado as (typeof ESTADOS)[number]) ? (b.estado as (typeof ESTADOS)[number]) : null;
  const linha = {
    devolucao_id: id,
    peso_envio_kg: b.peso_envio_kg ?? null,
    peso_chegada_kg: b.peso_chegada_kg ?? null,
    itens: b.itens ?? null,
    estado,
    destino: estado ? DESTINO[estado] : null,
    observacao: b.observacao ?? null,
    inspecionado_por: null,
    inspecionado_em: b.concluir ? new Date().toISOString() : null,
    nfe_numero: b.nfe_numero || null,
    nfe_data: b.nfe_data || null,
    ajuste_upseller_feito: !!b.ajuste_upseller_feito,
  };
  const { data: existente } = await supabase.from("devolucao_inspecoes").select("id").eq("devolucao_id", id).order("criado_em", { ascending: false }).limit(1).maybeSingle();
  const { data: salvo, error } = existente ? await supabase.from("devolucao_inspecoes").update(linha).eq("id", existente.id).select("id").single() : await supabase.from("devolucao_inspecoes").insert(linha).select("id").single();
  if (error) return NextResponse.json({ sucesso: false, erro: error.message }, { status: 500 });

  const patch: Record<string, unknown> = {};
  if (b.chegou) patch.chegou_em = new Date().toISOString();
  patch.etapa = b.concluir ? (estado === "diferente_ou_faltando" ? "decisao" : "inspecao") : "inspecao";
  await supabase.from("devolucoes").update(patch).eq("id", id);

  const quem = escopo.email ?? "equipe";
  const eventos: { tipo: string; descricao: string; chave: string }[] = [];
  if (b.chegou) eventos.push({ tipo: "recebido", descricao: `Pacote recebido e bipado por ${quem}`, chave: "recebido" });
  if (b.peso_chegada_kg != null) eventos.push({ tipo: "peso", descricao: `Peso na chegada ${b.peso_chegada_kg} kg${b.peso_envio_kg ? ` (envio ${b.peso_envio_kg} kg)` : ""}`, chave: `peso:${b.peso_chegada_kg}` });
  if (b.concluir && estado) {
    const dest = DESTINO[estado];
    eventos.push({ tipo: "inspecao", descricao: `Inspeção: ${estado} → ${dest}${b.observacao ? ` · ${b.observacao}` : ""}`, chave: `inspecao:${salvo.id}:${estado}` });
    if (dest === "estoque" || dest === "saldo") eventos.push({ tipo: "tarefa_upseller", descricao: `Tarefa: ajustar estoque no UpSeller (${dest === "estoque" ? "disponível" : "saldo/outlet"}) e emitir NF-e de devolução`, chave: `tarefa_upseller:${salvo.id}` });
    if (dest === "avaria") eventos.push({ tipo: "tarefa_garantia", descricao: "Tarefa: abrir garantia com o fornecedor (avaria)", chave: `tarefa_garantia:${salvo.id}` });
    if (dest === "contestacao") eventos.push({ tipo: "contestacao_sugerida", descricao: "Inspeção aponta item diferente ou faltando: abrir contestação com as provas", chave: `contestacao:${salvo.id}` });
  }
  if (eventos.length) await supabase.from("devolucao_eventos").upsert(eventos.map((e) => ({ devolucao_id: id, origem: "equipe", ...e })), { onConflict: "devolucao_id,chave", ignoreDuplicates: true });
  return NextResponse.json({ sucesso: true, inspecao_id: salvo.id, destino: estado ? DESTINO[estado] : null });
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const escopo = await escopoDoUsuario();
  const d = await carregarDevolucao(id);
  if (!d || !podeVerLoja(escopo, d.loja_id)) return NextResponse.json({ sucesso: false, erro: "Caso não encontrado." }, { status: 404 });
  const { data } = await supabase.from("devolucao_inspecoes").select("*").eq("devolucao_id", id).order("criado_em", { ascending: false }).limit(1).maybeSingle();
  return NextResponse.json({ sucesso: true, inspecao: data });
}
