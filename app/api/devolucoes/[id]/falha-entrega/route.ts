import { NextRequest, NextResponse } from "next/server";
import { escopoDoUsuario, podeVerLoja } from "@/lib/conta";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// Ações de um caso de FALHA DE ENTREGA (não há disputa pela API para esse tipo):
//   { acao: "validado", peso_chegada_kg?, observacao? }  → inspeção OK, volta ao estoque, caso encerrado
//   { acao: "chamado",  observacao? }                     → registra o chamado aberto na Shopee; caso aguarda a plataforma
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const escopo = await escopoDoUsuario();
  const { data: d } = await supabase.from("devolucoes").select("id, loja_id, tipo, chegou_em").eq("id", id).maybeSingle();
  if (!d || !podeVerLoja(escopo, d.loja_id)) return NextResponse.json({ sucesso: false, erro: "Caso não encontrado." }, { status: 404 });
  if (d.tipo !== "falha_entrega") return NextResponse.json({ sucesso: false, erro: "Só para falhas de entrega." }, { status: 400 });
  let b: { acao?: string; peso_chegada_kg?: number | null; observacao?: string };
  try {
    b = await request.json();
  } catch {
    return NextResponse.json({ sucesso: false, erro: "JSON inválido." }, { status: 400 });
  }
  const quem = escopo.email ?? "equipe";
  const agora = new Date().toISOString();
  if (b.acao === "validado") {
    const linha = { devolucao_id: id, peso_chegada_kg: b.peso_chegada_kg ?? null, estado: "novo", destino: "estoque", observacao: b.observacao ?? null, inspecionado_em: agora, inspecionado_por: null };
    const { data: existente } = await supabase.from("devolucao_inspecoes").select("id").eq("devolucao_id", id).order("criado_em", { ascending: false }).limit(1).maybeSingle();
    const { data: salvo, error } = existente ? await supabase.from("devolucao_inspecoes").update(linha).eq("id", existente.id).select("id").single() : await supabase.from("devolucao_inspecoes").insert(linha).select("id").single();
    if (error) return NextResponse.json({ sucesso: false, erro: error.message }, { status: 500 });
    await supabase.from("devolucoes").update({ etapa: "encerrado", status_plataforma: "VALIDADO", chegou_em: d.chegou_em ?? agora, atualizado_em: agora }).eq("id", id);
    await supabase.from("devolucao_eventos").upsert(
      [
        { devolucao_id: id, origem: "equipe", tipo: "inspecao", descricao: `Validado por ${quem}: pacote íntegro, voltou ao estoque${b.observacao ? ` · ${b.observacao}` : ""}`, chave: `inspecao:${salvo.id}:novo` },
        { devolucao_id: id, origem: "equipe", tipo: "tarefa_upseller", descricao: "Tarefa: ajustar estoque no UpSeller (disponível)", chave: `tarefa_upseller:${salvo.id}` },
      ],
      { onConflict: "devolucao_id,chave", ignoreDuplicates: true }
    );
    return NextResponse.json({ sucesso: true, etapa: "encerrado" });
  }
  if (b.acao === "chamado") {
    await supabase.from("devolucoes").update({ etapa: "decisao", status_plataforma: "CHAMADO_SHOPEE", atualizado_em: agora }).eq("id", id);
    await supabase.from("devolucao_eventos").upsert([{ devolucao_id: id, origem: "equipe", tipo: "chamado", descricao: `Chamado aberto na Shopee por ${quem}${b.observacao ? `: ${b.observacao}` : ""}`, chave: `chamado:${agora.slice(0, 10)}` }], { onConflict: "devolucao_id,chave", ignoreDuplicates: true });
    return NextResponse.json({ sucesso: true, etapa: "decisao" });
  }
  return NextResponse.json({ sucesso: false, erro: "acao inválida." }, { status: 400 });
}
