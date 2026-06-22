import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

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

// Endpoint de diagnóstico: busca o detalhe COMPLETO de um pedido na Shopee e
// devolve o JSON cru, para confirmarmos os nomes exatos dos campos (itens,
// preços, frete, descontos). Use ?order_sn=XXXX ou deixe em branco para pegar
// o pedido real mais recente.
export async function GET(request: NextRequest) {
  try {
    const partnerId = process.env.SHOPEE_PARTNER_ID;
    const partnerKey = process.env.SHOPEE_PARTNER_KEY;

    if (!partnerId || !partnerKey) {
      return NextResponse.json(
        { sucesso: false, erro: "Credenciais Shopee não configuradas." },
        { status: 500 }
      );
    }

    // Pega uma loja Shopee com token ativo.
    const { data: token } = await supabase
      .from("marketplace_tokens")
      .select("*")
      .eq("marketplace", "shopee")
      .eq("status", "ativo")
      .limit(1)
      .single();

    if (!token?.access_token || !token?.shop_id) {
      return NextResponse.json(
        { sucesso: false, erro: "Nenhuma loja Shopee com token ativo." },
        { status: 400 }
      );
    }

    // order_sn: do parâmetro ou o pedido real mais recente da loja.
    let orderSn = request.nextUrl.searchParams.get("order_sn") || "";

    if (!orderSn) {
      const { data: pedido } = await supabase
        .from("pedidos")
        .select("pedido_externo_id")
        .eq("loja_id", token.loja_id)
        .eq("marketplace", "shopee")
        .not("pedido_externo_id", "like", "SH-%")
        .order("data_pedido", { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();

      orderSn = pedido?.pedido_externo_id || "";
    }

    if (!orderSn) {
      return NextResponse.json(
        { sucesso: false, erro: "Nenhum pedido real encontrado para consultar." },
        { status: 404 }
      );
    }

    const path = "/api/v2/order/get_order_detail";
    const timestamp = Math.floor(Date.now() / 1000);
    const shopId = String(token.shop_id);
    const accessToken = token.access_token;

    const sign = gerarAssinatura(
      String(partnerId),
      path,
      timestamp,
      accessToken,
      shopId,
      String(partnerKey)
    );

    const url = new URL(`${BASE_URL}${path}`);
    url.searchParams.set("partner_id", String(partnerId));
    url.searchParams.set("timestamp", String(timestamp));
    url.searchParams.set("access_token", accessToken);
    url.searchParams.set("shop_id", shopId);
    url.searchParams.set("sign", sign);
    url.searchParams.set("order_sn_list", orderSn);
    url.searchParams.set(
      "response_optional_fields",
      [
        "item_list",
        "total_amount",
        "order_status",
        "buyer_username",
        "recipient_address",
        "actual_shipping_fee",
        "estimated_shipping_fee",
        "pay_time",
        "payment_method",
        "package_list",
        "invoice_data",
        "note",
      ].join(",")
    );

    const response = await fetch(url.toString(), {
      method: "GET",
      cache: "no-store",
    });

    const resultado = await response.json();

    const detalhe = resultado?.response?.order_list?.[0] ?? null;

    return NextResponse.json({
      sucesso: !resultado?.error,
      order_sn: orderSn,
      // Resumo dos itens, pra leitura rápida.
      itens_resumo:
        detalhe?.item_list?.map(
          (item: {
            item_name?: string;
            model_original_price?: number;
            model_discounted_price?: number;
            model_quantity_purchased?: number;
          }) => ({
            nome: item.item_name,
            preco_original: item.model_original_price,
            preco_com_desconto: item.model_discounted_price,
            quantidade: item.model_quantity_purchased,
          })
        ) ?? null,
      total_amount: detalhe?.total_amount ?? null,
      frete: detalhe?.actual_shipping_fee ?? null,
      // JSON cru completo do pedido, para confirmarmos todos os campos.
      detalhe_completo: detalhe,
      retorno_bruto: resultado,
    });
  } catch (error) {
    return NextResponse.json(
      {
        sucesso: false,
        erro: error instanceof Error ? error.message : "Erro desconhecido.",
      },
      { status: 500 }
    );
  }
}
