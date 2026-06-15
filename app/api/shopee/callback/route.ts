import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;

    const code = searchParams.get("code");
    const shopId = searchParams.get("shop_id");
    const mainAccountId = searchParams.get("main_account_id");

    if (!code) {
      return NextResponse.json(
        {
          sucesso: false,
          erro: "Código de autorização não recebido pela Shopee.",
        },
        { status: 400 }
      );
    }

    await supabase.from("sincronizacoes").insert({
      marketplace: "shopee",
      tipo: "oauth",
      status: "sucesso",
      registros_importados: 0,
      mensagem: `Callback Shopee recebido. Shop ID: ${
        shopId || "não informado"
      }. Main Account ID: ${mainAccountId || "não informado"}.`,
      iniciado_em: new Date().toISOString(),
      finalizado_em: new Date().toISOString(),
    });

    return NextResponse.redirect(
      new URL("/integracoes?shopee=callback_recebido", request.url)
    );
  } catch (error) {
    return NextResponse.json(
      {
        sucesso: false,
        erro:
          error instanceof Error
            ? error.message
            : "Erro desconhecido no callback da Shopee.",
      },
      { status: 500 }
    );
  }
}