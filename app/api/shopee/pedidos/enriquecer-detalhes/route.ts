import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET() {
  const { data, error } = await supabase
    .from("marketplace_tokens")
    .select("shop_id, access_token")
    .eq("marketplace", "shopee")
    .eq("status", "ativo")
    .single();

  if (error || !data) {
    return NextResponse.json({
      sucesso: false,
      erro: "Token não encontrado",
    });
  }

  return NextResponse.json({
    sucesso: true,
    shop_id: data.shop_id,
    token_encontrado: !!data.access_token,
    tamanho_token: data.access_token?.length ?? 0,
  });
}