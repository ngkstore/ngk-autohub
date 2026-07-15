import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { escopoDoUsuario } from "@/lib/conta";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Recebe as linhas já parseadas no navegador (planilha do Business Insights) e
// guarda de forma flexível, amarrado à conta/loja do usuário logado.
export async function POST(request: NextRequest) {
  try {
    const escopo = await escopoDoUsuario();
    if (!escopo.contaId) {
      return NextResponse.json(
        { sucesso: false, erro: "Usuário sem conta." },
        { status: 400 }
      );
    }

    const body = await request.json();
    const arquivo = String(body?.arquivo || "planilha");
    const colunas: string[] = Array.isArray(body?.colunas) ? body.colunas : [];
    const linhas: unknown[] = Array.isArray(body?.linhas) ? body.linhas : [];
    let lojaId: string | null = body?.loja_id || null;

    // Loja só pode ser uma das lojas do usuário (senão ignora).
    if (lojaId && !escopo.admin && !escopo.lojaIds.includes(lojaId)) {
      lojaId = null;
    }

    if (linhas.length === 0) {
      return NextResponse.json(
        { sucesso: false, erro: "Planilha vazia ou não reconhecida." },
        { status: 400 }
      );
    }

    // Trava de segurança de volume.
    const linhasLimitadas = linhas.slice(0, 20000);

    const { data, error } = await supabase
      .from("insights_importacoes")
      .insert({
        conta_id: escopo.contaId,
        loja_id: lojaId,
        arquivo,
        colunas,
        total_linhas: linhasLimitadas.length,
        linhas: linhasLimitadas,
      })
      .select("id")
      .single();

    if (error) {
      return NextResponse.json(
        { sucesso: false, erro: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      sucesso: true,
      id: data?.id,
      total_linhas: linhasLimitadas.length,
      colunas,
    });
  } catch (error) {
    return NextResponse.json(
      {
        sucesso: false,
        erro: error instanceof Error ? error.message : "Erro ao importar.",
      },
      { status: 500 }
    );
  }
}
