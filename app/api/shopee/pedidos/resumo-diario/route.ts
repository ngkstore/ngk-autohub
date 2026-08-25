import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Recria as tabelas-resumo (dashboard + finanças) que as telas leem.
// Roda por cron; a varredura da tabela gorda tem timeout próprio nas funções.
async function rodar() {
  const ped = await supabase.rpc("rebuild_pedidos_resumo_diario");
  const fin = await supabase.rpc("rebuild_financas_resumo_diario");
  const erro = ped.error?.message || fin.error?.message;
  if (erro) {
    return NextResponse.json({ sucesso: false, erro }, { status: 500 });
  }
  return NextResponse.json({ sucesso: true });
}

export async function GET() {
  return rodar();
}

export async function POST() {
  return rodar();
}
