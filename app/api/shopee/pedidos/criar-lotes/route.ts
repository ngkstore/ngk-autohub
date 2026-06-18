import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

function adicionarHoras(data: Date, horas: number) {
  const novaData = new Date(data);
  novaData.setHours(novaData.getHours() + horas);
  return novaData;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const lojaId = body.lojaId;
    const dataInicio = body.dataInicio;
    const dataFim = body.dataFim;
    const tamanhoLoteHoras = body.tamanhoLoteHoras || 6;

    if (!lojaId) {
      return NextResponse.json(
        { sucesso: false, erro: "lojaId não informado." },
        { status: 400 }
      );
    }

    if (!dataInicio || !dataFim) {
      return NextResponse.json(
        {
          sucesso: false,
          erro: "Informe dataInicio e dataFim.",
        },
        { status: 400 }
      );
    }

    const inicio = new Date(dataInicio);
    const fim = new Date(dataFim);

    if (inicio >= fim) {
      return NextResponse.json(
        {
          sucesso: false,
          erro: "dataInicio precisa ser menor que dataFim.",
        },
        { status: 400 }
      );
    }

    const { data: loja, error: lojaError } = await supabase
      .from("lojas")
      .select("id, apelido, marketplace")
      .eq("id", lojaId)
      .single();

    if (lojaError || !loja) {
      return NextResponse.json(
        { sucesso: false, erro: "Loja não encontrada." },
        { status: 404 }
      );
    }

    const lotes = [];
    let cursor = inicio;

    while (cursor < fim) {
      const proximoFim = adicionarHoras(cursor, tamanhoLoteHoras);
      const fimDoLote = proximoFim > fim ? fim : proximoFim;

      lotes.push({
        marketplace: "shopee",
        tipo: "pedidos",
        status: "pendente",
        loja_id: lojaId,
        data_inicio: cursor.toISOString(),
        data_fim: fimDoLote.toISOString(),
        progresso: 0,
        total_registros: 0,
        criado_em: new Date().toISOString(),
        atualizado_em: new Date().toISOString(),
      });

      cursor = fimDoLote;
    }

    const { error: insertError } = await supabase
      .from("sync_jobs")
      .insert(lotes);

    if (insertError) {
      return NextResponse.json(
        {
          sucesso: false,
          erro: "Erro ao criar lotes.",
          detalhe: insertError.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      sucesso: true,
      mensagem: `${lotes.length} lotes criados com sucesso.`,
      totalLotes: lotes.length,
    });
  } catch (error) {
    return NextResponse.json(
      {
        sucesso: false,
        erro:
          error instanceof Error
            ? error.message
            : "Erro desconhecido ao criar lotes.",
      },
      { status: 500 }
    );
  }
}