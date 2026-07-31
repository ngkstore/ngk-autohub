import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { escopoDoUsuario, podeVerLoja } from "@/lib/conta";

export const dynamic = "force-dynamic";

// Salva o custo (total por unidade) de um produto. Só quem é da conta da loja.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const produtoId = body?.produtoId as string | undefined;
    const custoBruto = body?.custo;
    if (!produtoId) {
      return NextResponse.json({ sucesso: false, erro: "produtoId não informado." }, { status: 400 });
    }
    const custo =
      custoBruto === "" || custoBruto === null || custoBruto === undefined
        ? null
        : Number(String(custoBruto).replace(",", "."));
    if (custo !== null && !Number.isFinite(custo)) {
      return NextResponse.json({ sucesso: false, erro: "Custo inválido." }, { status: 400 });
    }

    const { data: prod } = await supabase
      .from("produtos")
      .select("loja_id")
      .eq("id", produtoId)
      .maybeSingle();
    if (!prod) {
      return NextResponse.json({ sucesso: false, erro: "Produto não encontrado." }, { status: 404 });
    }

    const escopo = await escopoDoUsuario();
    if (!podeVerLoja(escopo, prod.loja_id)) {
      return NextResponse.json({ sucesso: false, erro: "Produto fora da sua conta." }, { status: 403 });
    }

    const { error } = await supabase.from("produtos").update({ custo }).eq("id", produtoId);
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
