import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { escopoDoUsuario } from "@/lib/conta";

export const dynamic = "force-dynamic";

// Mostra o que a extensão capturou: quais endpoints do painel apareceram e
// quantas vezes. Serve p/ sabermos ONDE mora cada dado antes de modelar.
export async function GET() {
  const escopo = await escopoDoUsuario();

  let q = supabase
    .from("coletor_capturas")
    .select("id, url, shop_id, loja_id, payload, capturado_em")
    .order("capturado_em", { ascending: false })
    .limit(200);
  if (!escopo.admin) q = q.in("conta_id", escopo.contaId ? [escopo.contaId] : []);

  const { data, error } = await q;
  if (error) {
    return NextResponse.json({ sucesso: false, erro: error.message }, { status: 500 });
  }

  // Agrupa por endpoint (sem a query string), p/ ver o cardápio.
  const porEndpoint = new Map<string, { vezes: number; ultima: string; exemploChaves: string[] }>();
  (data || []).forEach((c) => {
    const base = String(c.url || "").split("?")[0];
    const atual = porEndpoint.get(base);
    const chaves =
      c.payload && typeof c.payload === "object"
        ? Object.keys(c.payload as Record<string, unknown>)
        : [];
    if (atual) {
      atual.vezes++;
    } else {
      porEndpoint.set(base, {
        vezes: 1,
        ultima: c.capturado_em as string,
        exemploChaves: chaves,
      });
    }
  });

  return NextResponse.json({
    sucesso: true,
    total_capturas: (data || []).length,
    lojas_reconhecidas: (data || []).filter((c) => c.loja_id).length,
    endpoints: Array.from(porEndpoint.entries())
      .map(([url, i]) => ({ url, ...i }))
      .sort((a, b) => b.vezes - a.vezes),
  });
}
