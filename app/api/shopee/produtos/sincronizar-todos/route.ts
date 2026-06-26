import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const BASE_URL = process.env.SHOPEE_API_BASE_URL || "https://partner.shopeemobile.com";

// Status que ainda retornam no get_item_list (produtos com avaliações antigas
// costumam estar em UNLIST/BANNED/REVIEWING, não só em NORMAL).
const STATUSES = ["NORMAL", "UNLIST", "BANNED", "REVIEWING"];

function sign(partnerId: string, path: string, ts: number, token: string, shopId: string, key: string) {
  return crypto
    .createHmac("sha256", key)
    .update(`${partnerId}${path}${ts}${token}${shopId}`)
    .digest("hex");
}

function pegarPreco(item: { price_info?: { current_price?: number; original_price?: number }[] }) {
  const p = item.price_info?.[0];
  return p?.current_price || p?.original_price || 0;
}

function pegarEstoque(item: {
  stock_info_v2?: { summary_info?: { total_available_stock?: number } };
}) {
  return item.stock_info_v2?.summary_info?.total_available_stock || 0;
}

export async function POST(request: NextRequest) {
  try {
    const partnerId = process.env.SHOPEE_PARTNER_ID;
    const partnerKey = process.env.SHOPEE_PARTNER_KEY;
    if (!partnerId || !partnerKey) {
      return NextResponse.json({ sucesso: false, erro: "Credenciais Shopee ausentes." }, { status: 500 });
    }

    let statusIdx = 0;
    let offset = 0;
    try {
      const body = await request.json();
      if (typeof body?.statusIdx === "number") statusIdx = body.statusIdx;
      if (typeof body?.offset === "number") offset = body.offset;
    } catch {
      // padrão
    }

    if (statusIdx >= STATUSES.length) {
      return NextResponse.json({ sucesso: true, done: true });
    }

    const { data: token } = await supabase
      .from("marketplace_tokens")
      .select("access_token, shop_id, loja_id")
      .eq("marketplace", "shopee")
      .eq("status", "ativo")
      .limit(1)
      .single();

    if (!token?.access_token || !token?.shop_id) {
      return NextResponse.json({ sucesso: false, erro: "Token Shopee ativo não encontrado." }, { status: 400 });
    }

    const accessToken = token.access_token;
    const shopId = String(token.shop_id);
    const lojaId = token.loja_id;
    const itemStatus = STATUSES[statusIdx];
    const pageSize = 50;

    // 1) get_item_list (uma página)
    const listPath = "/api/v2/product/get_item_list";
    const ts1 = Math.floor(Date.now() / 1000);
    const listUrl =
      `${BASE_URL}${listPath}?partner_id=${partnerId}&timestamp=${ts1}` +
      `&access_token=${encodeURIComponent(accessToken)}&shop_id=${shopId}` +
      `&sign=${sign(String(partnerId), listPath, ts1, accessToken, shopId, String(partnerKey))}` +
      `&offset=${offset}&page_size=${pageSize}&item_status=${itemStatus}`;

    const listResp = await fetch(listUrl, { method: "GET", cache: "no-store" });
    const listData = await listResp.json();

    if (listData?.error) {
      // status pode não ser válido p/ a loja — pula pro próximo
      return NextResponse.json({
        sucesso: true,
        status: itemStatus,
        salvos: 0,
        proximoStatusIdx: statusIdx + 1,
        proximoOffset: 0,
        done: statusIdx + 1 >= STATUSES.length,
        aviso: `${listData.error} | ${listData.message || ""}`,
      });
    }

    const items = listData.response?.item || [];
    let salvos = 0;

    if (items.length > 0) {
      const itemIds = items.map((i: { item_id: number }) => String(i.item_id));

      // 2) get_item_base_info para os nomes/preços
      const infoPath = "/api/v2/product/get_item_base_info";
      const ts2 = Math.floor(Date.now() / 1000);
      const infoUrl =
        `${BASE_URL}${infoPath}?partner_id=${partnerId}&timestamp=${ts2}` +
        `&access_token=${encodeURIComponent(accessToken)}&shop_id=${shopId}` +
        `&sign=${sign(String(partnerId), infoPath, ts2, accessToken, shopId, String(partnerKey))}` +
        `&item_id_list=${itemIds.join(",")}`;

      const infoResp = await fetch(infoUrl, { method: "GET", cache: "no-store" });
      const infoData = await infoResp.json();
      const detalhes = infoData.response?.item_list || [];

      for (const item of detalhes) {
        const registro = {
          loja_id: lojaId,
          marketplace: "shopee",
          item_id: String(item.item_id),
          shop_id: shopId,
          sku: item.item_sku || String(item.item_id),
          nome: item.item_name || "Produto sem nome",
          preco: pegarPreco(item),
          estoque: pegarEstoque(item),
          status: item.item_status || itemStatus,
          imagem_url: item.image?.image_url_list?.[0] || null,
          categoria: item.category_id ? String(item.category_id) : null,
          atualizado_em: new Date().toISOString(),
        };

        const { data: existente } = await supabase
          .from("produtos")
          .select("id")
          .eq("loja_id", lojaId)
          .eq("item_id", String(item.item_id))
          .maybeSingle();

        if (existente?.id) {
          await supabase.from("produtos").update(registro).eq("id", existente.id);
        } else {
          await supabase
            .from("produtos")
            .insert({ ...registro, criado_em: new Date().toISOString() });
        }
        salvos++;
      }
    }

    const hasNext = !!listData.response?.has_next_page;
    const nextOffset = listData.response?.next_offset ?? offset + pageSize;

    // Avança: mais páginas neste status, ou próximo status.
    let proximoStatusIdx = statusIdx;
    let proximoOffset = Number(nextOffset);
    if (!hasNext || items.length === 0) {
      proximoStatusIdx = statusIdx + 1;
      proximoOffset = 0;
    }

    return NextResponse.json({
      sucesso: true,
      status: itemStatus,
      salvos,
      proximoStatusIdx,
      proximoOffset,
      done: proximoStatusIdx >= STATUSES.length,
    });
  } catch (error) {
    return NextResponse.json(
      {
        sucesso: false,
        erro: error instanceof Error ? error.message : "Erro ao sincronizar produtos.",
      },
      { status: 500 }
    );
  }
}
