import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { sincronizarChatsTikTok } from "@/lib/tiktok/responderChats";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

async function processarLojas() {
  const { data: lojas } = await supabase
    .from("marketplace_tokens")
    .select("loja_id")
    .eq("marketplace", "tiktok_shop")
    .in("status", ["ativo"]);

  const ids = [...new Set((lojas || []).map((l) => l.loja_id as string))];
  const resultados = [];

  for (const lojaId of ids) {
    try {
      const r = await sincronizarChatsTikTok(lojaId);
      resultados.push({ lojaId, ...r });
    } catch (e) {
      resultados.push({ lojaId, erro: e instanceof Error ? e.message : String(e) });
    }
  }
  return resultados;
}

export async function GET() {
  try {
    const resultados = await processarLojas();
    return NextResponse.json({ sucesso: true, lojas: resultados });
  } catch (error) {
    return NextResponse.json(
      { sucesso: false, erro: error instanceof Error ? error.message : "Erro sync chat TikTok" },
      { status: 500 }
    );
  }
}
