import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import {
  processarUmLote,
  JANELA_MAXIMA_DIAS,
} from "@/lib/shopee/sincronizarPedidos";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    let lojaId: string | undefined;
    let dias = 7;

    try {
      const body = await request.json();
      lojaId = body?.lojaId;
      if (body?.dias) dias = Number(body.dias);
    } catch {
      // sem corpo — segue com os padrões
    }

    if (!lojaId) {
      return NextResponse.json(
        { sucesso: false, erro: "lojaId não informado." },
        { status: 400 }
      );
    }

    // Shopee só aceita janela de create_time de até 15 dias por chamada.
    if (!Number.isFinite(dias) || dias < 1) dias = 7;
    if (dias > JANELA_MAXIMA_DIAS) dias = JANELA_MAXIMA_DIAS;

    const { data: token } = await supabase
      .from("marketplace_tokens")
      .select("id")
      .eq("loja_id", lojaId)
      .eq("marketplace", "shopee")
      .eq("status", "ativo")
      .maybeSingle();

    if (!token) {
      return NextResponse.json(
        {
          sucesso: false,
          erro: "Loja sem token Shopee ativo. Conecte a loja antes de sincronizar.",
        },
        { status: 400 }
      );
    }

    const agora = new Date();
    const inicio = new Date(agora);
    inicio.setDate(inicio.getDate() - dias);

    const { data: novoLote, error: insertError } = await supabase
      .from("sync_jobs")
      .insert({
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
      })
      .select("id, loja_id, data_inicio, data_fim")
      .single();

    if (insertError || !novoLote) {
      return NextResponse.json(
        {
          sucesso: false,
          erro: "Erro ao criar lote.",
          detalhe: insertError?.message,
        },
        { status: 500 }
      );
    }

    // Processa apenas o lote recém-criado (a janela pedida), para o teste ser
    // rápido e isolado — não drena o backlog acumulado pelo cron.
    const resultado = await processarUmLote(novoLote);
    const houveErro = resultado.status === "erro";

    return NextResponse.json({
      sucesso: !houveErro,
      mensagem: houveErro
        ? resultado.mensagem
        : `${resultado.total} pedido(s) sincronizado(s) dos últimos ${dias} dia(s).`,
      janelaDias: dias,
      lotesProcessados: 1,
      totalPedidos: resultado.total,
      resultados: [resultado],
    });
  } catch (error) {
    return NextResponse.json(
      {
        sucesso: false,
        erro:
          error instanceof Error
            ? error.message
            : "Erro desconhecido ao sincronizar pedidos.",
      },
      { status: 500 }
    );
  }
}
