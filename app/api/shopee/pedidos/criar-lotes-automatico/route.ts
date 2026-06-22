import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

async function criarLotesAutomatico() {
  try {
    // Detecta automaticamente todas as lojas Shopee com token ativo.
    const { data: tokens, error: tokensError } = await supabase
      .from("marketplace_tokens")
      .select("loja_id")
      .eq("marketplace", "shopee")
      .eq("status", "ativo");

    if (tokensError) {
      return NextResponse.json(
        { sucesso: false, erro: tokensError.message },
        { status: 500 }
      );
    }

    const lojaIds = [
      ...new Set((tokens || []).map((t) => t.loja_id).filter(Boolean)),
    ];

    if (lojaIds.length === 0) {
      return NextResponse.json({
        sucesso: true,
        mensagem: "Nenhuma loja Shopee com token ativo.",
        lotesCriados: 0,
      });
    }

    const agora = new Date();
    const inicio = new Date(agora);
    inicio.setMinutes(inicio.getMinutes() - 15);

    const criados: string[] = [];

    for (const lojaId of lojaIds) {
      // Evita duplicar lote para a mesma janela recente.
      const { data: loteExistente } = await supabase
        .from("sync_jobs")
        .select("id")
        .eq("marketplace", "shopee")
        .eq("tipo", "pedidos")
        .eq("loja_id", lojaId)
        .gte("data_inicio", inicio.toISOString())
        .lte("data_fim", agora.toISOString())
        .limit(1)
        .maybeSingle();

      if (loteExistente) continue;

      const { error: insertError } = await supabase.from("sync_jobs").insert({
        marketplace: "shopee",
        tipo: "pedidos",
        status: "pendente",
        loja_id: lojaId,
        data_inicio: inicio.toISOString(),
        data_fim: agora.toISOString(),
        progresso: 0,
        total_registros: 0,
        criado_em: new Date().toISOString(),
        atualizado_em: new Date().toISOString(),
      });

      if (!insertError) criados.push(lojaId);
    }

    return NextResponse.json({
      sucesso: true,
      mensagem: `${criados.length} lote(s) criado(s) para ${lojaIds.length} loja(s) Shopee.`,
      lojasComToken: lojaIds.length,
      lotesCriados: criados.length,
    });
  } catch (error) {
    return NextResponse.json(
      {
        sucesso: false,
        erro:
          error instanceof Error
            ? error.message
            : "Erro desconhecido ao criar lotes automáticos.",
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return criarLotesAutomatico();
}

export async function POST() {
  return criarLotesAutomatico();
}
