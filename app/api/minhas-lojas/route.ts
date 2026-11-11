import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { escopoDoUsuario } from "@/lib/conta";

export const dynamic = "force-dynamic";

// Lojas visíveis para o usuário logado (alimenta o seletor do topo), mais a hora
// da última sincronização concluída e a quantidade de alertas novos (Topbar, A2).
// Sempre escopado pela conta do usuário (via escopo.lojaIds).
export async function GET() {
  const escopo = await escopoDoUsuario();
  if (escopo.lojaIds.length === 0) return NextResponse.json({ lojas: [], sincronizado_em: null, alertas_novos: 0 });

  const [{ data: lojas }, { data: sync }, { count: alertas }] = await Promise.all([
    supabase.from("lojas").select("id, apelido, marketplace").in("id", escopo.lojaIds).order("apelido"),
    supabase
      .from("sync_jobs")
      .select("atualizado_em")
      .in("loja_id", escopo.lojaIds)
      .in("status", ["concluido", "sucesso"])
      .order("atualizado_em", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from("alertas").select("id", { count: "exact", head: true }).in("loja_id", escopo.lojaIds).eq("status", "novo"),
  ]);

  return NextResponse.json({
    lojas: lojas || [],
    sincronizado_em: sync?.atualizado_em ?? null,
    alertas_novos: alertas ?? 0,
  });
}
