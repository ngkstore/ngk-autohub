import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { escopoDoUsuario, podeVerLoja } from "@/lib/conta";

export const dynamic = "force-dynamic";

// Salva o custo de UMA variação (model_sku) numa loja. Só quem é da conta da loja.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const lojaId = body?.lojaId as string | undefined;
    const modelSku = String(body?.modelSku || "").trim().toUpperCase();
    const custoBruto = body?.custo;
    if (!lojaId || !modelSku) {
      return NextResponse.json({ sucesso: false, erro: "lojaId ou modelSku ausente." }, { status: 400 });
    }
    const custo =
      custoBruto === "" || custoBruto === null || custoBruto === undefined
        ? null
        : Number(String(custoBruto).replace(",", "."));
    if (custo !== null && !Number.isFinite(custo)) {
      return NextResponse.json({ sucesso: false, erro: "Custo inválido." }, { status: 400 });
    }

    const escopo = await escopoDoUsuario();
    if (!podeVerLoja(escopo, lojaId)) {
      return NextResponse.json({ sucesso: false, erro: "Loja fora da sua conta." }, { status: 403 });
    }

    const { error } = await supabase.from("custos_variacao").upsert(
      { loja_id: lojaId, model_sku: modelSku, custo, atualizado_em: new Date().toISOString() },
      { onConflict: "loja_id,model_sku" }
    );
    if (error) {
      return NextResponse.json({ sucesso: false, erro: error.message }, { status: 500 });
    }
    return NextResponse.json({ sucesso: true, custo });
  } catch (error) {
    return NextResponse.json(
      { sucesso: false, erro: error instanceof Error ? error.message : "Erro ao salvar custo." },
      { status: 500 }
    );
  }
}
