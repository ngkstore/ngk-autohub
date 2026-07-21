import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { trocarCodePorToken, listarLojasAutorizadas } from "@/lib/tiktok/client";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// TikTok redireciona pra cá com ?code=<auth_code>&state=<lojaId>.
export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const code = sp.get("code") || sp.get("auth_code");
    let lojaId = sp.get("state");

    if (!code) {
      return NextResponse.json(
        { sucesso: false, erro: "Sem code do TikTok.", recebido: Object.fromEntries(sp) },
        { status: 400 }
      );
    }

    // 1) Troca o code por token.
    const tk = await trocarCodePorToken(code);
    if (tk?.code !== 0 || !tk?.data?.access_token) {
      return NextResponse.json(
        { sucesso: false, erro: "Falha ao trocar code por token.", detalhe: tk },
        { status: 500 }
      );
    }
    const {
      access_token,
      refresh_token,
      access_token_expire_in,
      seller_name,
    } = tk.data;

    // 2) Descobre a loja autorizada (shop_id + shop_cipher).
    const shopsResp = await listarLojasAutorizadas(access_token);
    const shop = shopsResp?.data?.shops?.[0];
    if (!shop) {
      return NextResponse.json(
        { sucesso: false, erro: "Token ok, mas não achei a loja autorizada.", detalhe: shopsResp },
        { status: 500 }
      );
    }

    // 3) Resolve a loja no nosso banco: state, ou a loja TikTok "NGK".
    if (!lojaId) {
      const { data } = await supabase
        .from("lojas")
        .select("id")
        .ilike("marketplace", "%tiktok%")
        .ilike("apelido", "%NGK%")
        .maybeSingle();
      lojaId = data?.id ?? null;
    }
    if (!lojaId) {
      return NextResponse.json(
        { sucesso: false, erro: "Não identifiquei a loja. Conecte pela aba Integrações." },
        { status: 404 }
      );
    }

    // 4) Salva o token (substitui o anterior desta loja).
    await supabase
      .from("marketplace_tokens")
      .delete()
      .eq("loja_id", lojaId)
      .eq("marketplace", "tiktok_shop");

    const { error } = await supabase.from("marketplace_tokens").insert({
      loja_id: lojaId,
      marketplace: "tiktok_shop",
      access_token,
      refresh_token,
      shop_id: String(shop.id),
      shop_cipher: shop.cipher,
      expire_in: access_token_expire_in,
      status: "ativo",
      atualizado_em: new Date().toISOString(),
    });

    if (error) {
      return NextResponse.json(
        { sucesso: false, erro: "Token recebido, mas falhou ao salvar.", detalhe: error.message },
        { status: 500 }
      );
    }

    await supabase
      .from("lojas")
      .update({ shop_id: String(shop.id) })
      .eq("id", lojaId);

    await supabase.from("sincronizacoes").insert({
      loja_id: lojaId,
      marketplace: "tiktok_shop",
      tipo: "oauth",
      status: "sucesso",
      registros_importados: 1,
      mensagem: `TikTok conectado: ${shop.name || seller_name} (${shop.region}).`,
      iniciado_em: new Date().toISOString(),
      finalizado_em: new Date().toISOString(),
    });

    return NextResponse.redirect(new URL("/integracoes?tiktok=conectada", request.url));
  } catch (error) {
    return NextResponse.json(
      { sucesso: false, erro: error instanceof Error ? error.message : "Erro no callback TikTok." },
      { status: 500 }
    );
  }
}
