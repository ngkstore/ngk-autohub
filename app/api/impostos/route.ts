import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { escopoDoUsuario } from "@/lib/conta";

export const dynamic = "force-dynamic";

// Lança (ou atualiza) o imposto pago de um mês, na conta do usuário.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const competencia = String(body?.competencia || "").trim(); // 'YYYY-MM'
    const valor = Number(String(body?.valor ?? "").replace(",", "."));

    if (!/^\d{4}-\d{2}$/.test(competencia)) {
      return NextResponse.json({ sucesso: false, erro: "Competência inválida (use AAAA-MM)." }, { status: 400 });
    }
    if (!Number.isFinite(valor) || valor < 0) {
      return NextResponse.json({ sucesso: false, erro: "Valor inválido." }, { status: 400 });
    }

    const escopo = await escopoDoUsuario();
    if (!escopo.contaId) {
      return NextResponse.json({ sucesso: false, erro: "Usuário sem conta vinculada." }, { status: 403 });
    }

    const { error } = await supabase
      .from("impostos")
      .upsert(
        { conta_id: escopo.contaId, competencia, valor },
        { onConflict: "conta_id,competencia" }
      );
    if (error) {
      return NextResponse.json({ sucesso: false, erro: error.message }, { status: 500 });
    }
    return NextResponse.json({ sucesso: true });
  } catch (error) {
    return NextResponse.json(
      { sucesso: false, erro: error instanceof Error ? error.message : "Erro ao lançar imposto." },
      { status: 500 }
    );
  }
}
