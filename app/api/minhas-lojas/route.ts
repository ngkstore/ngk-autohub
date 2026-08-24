import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { escopoDoUsuario } from "@/lib/conta";

export const dynamic = "force-dynamic";

// Lojas visíveis para o usuário logado (alimenta o seletor do topo).
// Sempre escopado pela conta do usuário (via escopo.lojaIds).
export async function GET() {
  const escopo = await escopoDoUsuario();
  if (escopo.lojaIds.length === 0) return NextResponse.json({ lojas: [] });

  const { data } = await supabase
    .from("lojas")
    .select("id, apelido, marketplace")
    .in("id", escopo.lojaIds)
    .order("apelido");

  return NextResponse.json({ lojas: data || [] });
}
