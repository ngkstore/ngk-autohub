import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST() {
  try {
    const lojaId = "329df5fb-0d8f-4eb5-af36-ff216152cedf";

    const agora = new Date();
    const inicio = new Date(agora);
    inicio.setMinutes(inicio.getMinutes() - 15);

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

    if (loteExistente) {
      return NextResponse.json({
        sucesso: true,
        mensagem: "Lote recente já existe. Nenhum novo lote criado.",
      });
    }

    const { error } = await supabase.from("sync_jobs").insert({
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

    if (error) {
      return NextResponse.json(
        {
          sucesso: false,
          erro: "Erro ao criar lote automático.",
          detalhe: error.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      sucesso: true,
      mensagem: "Lote automático criado com sucesso.",
      dataInicio: inicio.toISOString(),
      dataFim: agora.toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        sucesso: false,
        erro:
          error instanceof Error
            ? error.message
            : "Erro desconhecido ao criar lote automático.",
      },
      { status: 500 }
    );
  }
}