import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { escopoDoUsuario } from "@/lib/conta";

export async function POST(request: Request) {
  try {
    // Chaves de parceiro (Shopee/TikTok): só o administrador altera.
    const escopo = await escopoDoUsuario();
    if (!escopo.admin) {
      return NextResponse.json({ sucesso: false, erro: "Só o administrador." }, { status: 403 });
    }
    const body = await request.json();

    const configuracoes = [
      "shopee_partner_id",
      "shopee_partner_key",
      "shopee_redirect_url",
      "tiktok_app_key",
      "tiktok_secret",
    ];

    for (const chave of configuracoes) {
      if (body[chave] !== undefined) {
        await supabase
          .from("configuracoes")
          .upsert(
            {
              chave,
              valor: body[chave],
              atualizado_em: new Date().toISOString(),
            },
            { onConflict: "chave" }
          );
      }
    }

    return NextResponse.json({
      sucesso: true,
      mensagem: "Configurações salvas com sucesso.",
    });
  } catch (error) {
    return NextResponse.json(
      {
        sucesso: false,
        erro:
          error instanceof Error
            ? error.message
            : "Erro ao salvar configurações.",
      },
      { status: 500 }
    );
  }
}