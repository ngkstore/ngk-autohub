import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Recria a tabela-resumo diária (pedidos_resumo_diario) que o dashboard lê.
// Roda por cron; a varredura da tabela gorda tem timeout próprio na função.
async function rodar() {
  const { error } = await supabase.rpc("rebuild_pedidos_resumo_diario");
  if (error) {
    return NextResponse.json({ sucesso: false, erro: error.message }, { status: 500 });
  }
  return NextResponse.json({ sucesso: true });
}

export async function GET() {
  return rodar();
}

export async function POST() {
  return rodar();
}
