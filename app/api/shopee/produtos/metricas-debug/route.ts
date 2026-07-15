import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BASE_URL =
  process.env.SHOPEE_API_BASE_URL || "https://partner.shopeemobile.com";

function assinar(
  partnerId: string,
  path: string,
  ts: number,
  accessToken: string,
  shopId: string,
  partnerKey: string
) {
  return crypto
    .createHmac("sha256", partnerKey)
    .update(`${partnerId}${path}${ts}${accessToken}${shopId}`)
    .digest("hex");
}

// SONDAGEM (não altera nada): mostra QUAIS métricas de anúncio a Shopee devolve
// de fato para um produto seu — get_item_base_info + get_item_extra_info.
// Use ?item_id=XXXX, ou deixe em branco para pegar o 1º produto Shopee.
export async function GET(request: NextRequest) {
  try {
    const partnerId = process.env.SHOPEE_PARTNER_ID;
    const partnerKey = process.env.SHOPEE_PARTNER_KEY;
    if (!partnerId || !partnerKey) {
      return NextResponse.json({ sucesso: false, erro: "Credenciais ausentes." }, { status: 500 });
    }

    // Produto: parâmetro, ou o primeiro produto Shopee com item_id.
    let itemId = request.nextUrl.searchParams.get("item_id") || "";
    let lojaId = "";
    let nome = "";
    {
      const q = supabase
        .from("produtos")
        .select("item_id, nome, loja_id")
        .eq("marketplace", "shopee")
        .not("item_id", "is", null);
      const { data: prod } = itemId
        ? await q.eq("item_id", itemId).limit(1).maybeSingle()
        : await q.limit(1).maybeSingle();
      itemId = prod?.item_id ? String(prod.item_id) : itemId;
      lojaId = prod?.loja_id || "";
      nome = prod?.nome || "";
    }

    if (!itemId) {
      return NextResponse.json({ sucesso: false, erro: "Nenhum produto Shopee encontrado. Informe ?item_id=..." });
    }

    // Token da loja dona do produto (ou o 1º ativo).
    const tokenQuery = supabase
      .from("marketplace_tokens")
      .select("access_token, shop_id")
      .eq("marketplace", "shopee")
      .eq("status", "ativo");
    const { data: token } = lojaId
      ? await tokenQuery.eq("loja_id", lojaId).limit(1).maybeSingle()
      : await tokenQuery.limit(1).maybeSingle();

    if (!token?.access_token || !token?.shop_id) {
      return NextResponse.json({ sucesso: false, erro: "Token ativo não encontrado." }, { status: 400 });
    }

    const shopId = String(token.shop_id);
    const accessToken = token.access_token;

    async function chamar(path: string) {
      const ts = Math.floor(Date.now() / 1000);
      const sign = assinar(String(partnerId), path, ts, accessToken, shopId, String(partnerKey));
      const url =
        `${BASE_URL}${path}?partner_id=${partnerId}&timestamp=${ts}` +
        `&access_token=${encodeURIComponent(accessToken)}&shop_id=${shopId}&sign=${sign}` +
        `&item_id_list=${itemId}`;
      const resp = await fetch(url, { method: "GET", cache: "no-store" });
      return resp.json();
    }

    // As duas fontes de métrica por anúncio na Open API.
    const [extra, base] = await Promise.all([
      chamar("/api/v2/product/get_item_extra_info"),
      chamar("/api/v2/product/get_item_base_info"),
    ]);

    const itemExtra = extra?.response?.item_list?.[0] || null;
    const itemBase = base?.response?.item_list?.[0] || null;

    return NextResponse.json({
      sucesso: true,
      item_id: itemId,
      nome,
      // O que REALMENTE volta de métrica agregada do anúncio:
      metricas_extra_info: itemExtra, // sale/views/likes/comment_count/rating...
      erro_extra_info: extra?.error ? `${extra.error} | ${extra.message}` : null,
      // Campos do anúncio (chaves disponíveis, sem despejar tudo):
      campos_base_info: itemBase ? Object.keys(itemBase) : null,
      erro_base_info: base?.error ? `${base.error} | ${base.message}` : null,
      nota: "get_item_extra_info = totais acumulados (sem série temporal). Impressões/carrinho/conversão/Ads normalmente NÃO vêm por aqui — só no Business Insights do Seller Center.",
    });
  } catch (error) {
    return NextResponse.json(
      { sucesso: false, erro: error instanceof Error ? error.message : "Erro." },
      { status: 500 }
    );
  }
}
