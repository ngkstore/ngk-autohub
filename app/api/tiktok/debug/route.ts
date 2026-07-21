import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { listarLojasAutorizadas } from "@/lib/tiktok/client";

export const dynamic = "force-dynamic";

// Sondagem: mostra o token TikTok salvo e testa uma chamada real (listar lojas).
export async function GET() {
  const temChave = !!process.env.TIKTOK_APP_KEY;
  const temSecret = !!process.env.TIKTOK_APP_SECRET;

  const { data: token } = await supabase
    .from("marketplace_tokens")
    .select("loja_id, shop_id, shop_cipher, status, atualizado_em, access_token")
    .eq("marketplace", "tiktok_shop")
    .eq("status", "ativo")
    .limit(1)
    .maybeSingle();

  let teste: unknown = "sem token salvo — conecte primeiro";
  if (token?.access_token) {
    try {
      const r = await listarLojasAutorizadas(token.access_token);
      teste = {
        code: r?.code,
        message: r?.message,
        lojas: r?.data?.shops?.map((s: Record<string, unknown>) => ({
          id: s.id,
          nome: s.name,
          regiao: s.region,
          tem_cipher: !!s.cipher,
        })),
      };
    } catch (e) {
      teste = { erro: e instanceof Error ? e.message : "erro" };
    }
  }

  return NextResponse.json({
    sucesso: true,
    env_configurado: { TIKTOK_APP_KEY: temChave, TIKTOK_APP_SECRET: temSecret },
    token_salvo: token
      ? {
          shop_id: token.shop_id,
          tem_cipher: !!token.shop_cipher,
          status: token.status,
          atualizado_em: token.atualizado_em,
        }
      : null,
    teste_chamada_real: teste,
  });
}
