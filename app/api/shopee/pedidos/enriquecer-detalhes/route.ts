import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET() {
  const { data, error } = await supabase
    .from("marketplace_tokens")
    .select("id, loja_id, marketplace, shop_id, status")
    .eq("marketplace", "shopee")
    .eq("status", "ativo")
    .limit(5);

  if (error) {
    return NextResponse.json({
      sucesso: false,
      erro: error.message,
    });
  }

  return NextResponse.json({
    sucesso: true,
    quantidade: data?.length ?? 0,
    tokens: data,
  });
}