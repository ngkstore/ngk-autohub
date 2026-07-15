import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { escopoDoUsuario } from "@/lib/conta";

export const dynamic = "force-dynamic";

// Lojas visíveis para o usuário logado (alimenta o seletor do topo).
export async function GET() {
  const escopo = await escopoDoUsuario();

  let query = supabase
    .from("lojas")
    .select("id, apelido, marketplace")
    .order("apelido");

  if (!escopo.admin) {
    if (!escopo.contaId) return NextResponse.json({ lojas: [] });
    query = query.eq("conta_id", escopo.contaId);
  }

  const { data } = await query;
  return NextResponse.json({ lojas: data || [] });
}
