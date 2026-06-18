import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET() {
  const { data, error } = await supabase
    .from("pedidos")
    .select("id, pedido_externo_id, loja_id, mercado")
    .eq("mercado", "shopee")
    .limit(5);

  if (error) {
    return NextResponse.json({
      sucesso: false,
      erro: error.message,
    });
  }

  return NextResponse.json({
    sucesso: true,
    quantidade: data.length,
    pedidos: data,
  });
}