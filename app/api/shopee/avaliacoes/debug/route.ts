import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const BASE_URL =
  process.env.SHOPEE_API_BASE_URL || "https://partner.shopeemobile.com";

function gerarAssinatura(
  partnerId: string,
  path: string,
  timestamp: number,
  accessToken: string,
  shopId: string,
  partnerKey: string
) {
  return crypto
    .createHmac("sha256", partnerKey)
    .update(`${partnerId}${path}${timestamp}${accessToken}${shopId}`)
    .digest("hex");
}

// Diagnóstico: conta quantas avaliações o get_comment realmente ALCANÇA para um
// produto (paginando até o fim ou até o teto), e compara com o que temos no banco.
// Use ?item_id=XXXX, ou deixe em branco para pegar o produto com "balan" no nome.
export async function GET(request: NextRequest) {
  try {
    const partnerId = process.env.SHOPEE_PARTNER_ID;
    const partnerKey = process.env.SHOPEE_PARTNER_KEY;
    if (!partnerId || !partnerKey) {
      return NextResponse.json({ sucesso: false, erro: "Credenciais ausentes." }, { status: 500 });
    }

    const { data: token } = await supabase
      .from("marketplace_tokens")
      .select("access_token, shop_id")
      .eq("marketplace", "shopee")
      .eq("status", "ativo")
      .limit(1)
      .single();

    if (!token?.access_token || !token?.shop_id) {
      return NextResponse.json({ sucesso: false, erro: "Token ativo não encontrado." }, { status: 400 });
    }

    // item_id do parâmetro, ou o produto com "balan" no nome.
    let itemId = request.nextUrl.searchParams.get("item_id") || "";
    let nome = "";
    if (!itemId) {
      const { data: prod } = await supabase
        .from("produtos")
        .select("item_id, nome")
        .eq("marketplace", "shopee")
        .ilike("nome", "%balan%")
        .not("item_id", "is", null)
        .limit(1)
        .maybeSingle();
      itemId = prod?.item_id ? String(prod.item_id) : "";
      nome = prod?.nome || "";
    }

    if (!itemId) {
      return NextResponse.json({ sucesso: false, erro: "Informe ?item_id=..." });
    }

    const shopId = String(token.shop_id);
    const accessToken = token.access_token;
    const path = "/api/v2/product/get_comment";

    let cursor = "";
    let total = 0;
    let paginas = 0;
    let esgotou = false;
    const maxPaginas = 250; // até ~25.000 por produto
    let ultimoErro: string | null = null;

    while (paginas < maxPaginas) {
      const ts = Math.floor(Date.now() / 1000);
      const sign = gerarAssinatura(String(partnerId), path, ts, accessToken, shopId, String(partnerKey));
      const url =
        `${BASE_URL}${path}?partner_id=${partnerId}&timestamp=${ts}` +
        `&access_token=${encodeURIComponent(accessToken)}&shop_id=${shopId}&sign=${sign}` +
        `&item_id=${itemId}&cursor=${encodeURIComponent(cursor)}&page_size=100`;

      const resp = await fetch(url, { method: "GET", cache: "no-store" });
      const data = await resp.json();

      if (data?.error) {
        ultimoErro = `${data.error} | ${data.message || ""}`;
        break;
      }

      const lista =
        data.response?.comment_list || data.response?.item_comment_list || [];
      total += lista.length;
      paginas++;

      const more = !!data.response?.more;
      cursor = data.response?.next_cursor || "";
      if (!more || lista.length === 0) {
        esgotou = true;
        break;
      }
    }

    // Quantas temos no banco para esse item.
    const { count: noBanco } = await supabase
      .from("avaliacoes")
      .select("id", { count: "exact", head: true })
      .eq("item_id", itemId);

    return NextResponse.json({
      sucesso: true,
      item_id: itemId,
      nome,
      total_alcancado_pela_api: total,
      paginas_lidas: paginas,
      esgotou, // true = get_comment chegou ao fim; false = parou no teto/erro
      atingiu_teto_de_paginas: paginas >= maxPaginas,
      no_banco: noBanco ?? 0,
      ultimo_erro: ultimoErro,
    });
  } catch (error) {
    return NextResponse.json(
      { sucesso: false, erro: error instanceof Error ? error.message : "Erro." },
      { status: 500 }
    );
  }
}
