import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Recria a tabela-resumo do DASHBOARD (rápida, <8s). O resumo de FINANÇAS é
// pesado (desaninha item_list) e passa dos 8s do anon, então roda via pg_cron
// dentro do banco (jobs rebuild-pedidos / rebuild-financas, a cada 10 min).
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
