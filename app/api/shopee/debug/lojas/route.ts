import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// Diagnóstico: mostra as lojas e a qual loja cada token Shopee está amarrado.
// Serve para conferir se a conexão da 2ª loja caiu na loja certa.
export async function GET() {
  const { data: lojas } = await supabase
    .from("lojas")
    .select("id, apelido, marketplace, shop_id")
    .order("apelido");

  const { data: tokens } = await supabase
    .from("marketplace_tokens")
    .select("id, loja_id, marketplace, shop_id, status, access_token, atualizado_em")
    .eq("marketplace", "shopee");

  const mapaLoja: Record<string, string> = {};
  (lojas || []).forEach((l) => {
    mapaLoja[l.id] = l.apelido;
  });

  return NextResponse.json({
    lojas: (lojas || []).map((l) => ({
      id: l.id,
      apelido: l.apelido,
      marketplace: l.marketplace,
      shop_id: l.shop_id ?? null,
    })),
    tokens: (tokens || []).map((t) => ({
      loja_id: t.loja_id,
      loja: mapaLoja[t.loja_id] || "(loja desconhecida)",
      shop_id: t.shop_id,
      status: t.status,
      tem_access_token: !!t.access_token,
      atualizado_em: t.atualizado_em,
    })),
  });
}
