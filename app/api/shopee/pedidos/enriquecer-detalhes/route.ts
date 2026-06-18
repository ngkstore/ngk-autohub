import { NextResponse } from "next/server";
import crypto from "crypto";
import { supabase } from "@/lib/supabase";

const SHOPEE_API_URL =
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

async function enriquecerPedidos() {
  try {
    const partnerId = process.env.SHOPEE_PARTNER_ID;
    const partnerKey = process.env.SHOPEE_PARTNER_KEY;

    if (!partnerId || !partnerKey) {
      return NextResponse.json(
        {
          sucesso: false,
          erro: "Credenciais Shopee não configuradas.",
        },
        { status: 500 }
      );
    }

    const { data: pedidos, error: pedidosError } = await supabase
      .from("pedidos")
      .select("id, loja_id, pedido_externo_id, dados_pedido")
      .eq("marketplace", "shopee")
      .not("pedido_externo_id", "is", null)
      .order("atualizado_em", { ascending: false })
      .limit(20);

    if (pedidosError) {
      throw new Error(`Erro ao buscar pedidos: ${pedidosError.message}`);
    }

    if (!pedidos || pedidos.length === 0) {
      return NextResponse.json({
        sucesso: true,
        mensagem: "Nenhum pedido Shopee encontrado para enriquecer.",
        encontrados: 0,
        atualizados: 0,
        erros: 0,
      });
    }

    let atualizados = 0;
    let ignorados = 0;
    let erros = 0;

    const detalhes: Array<{
      pedido_externo_id: string;
      status: string;
      mensagem: string;
    }> = [];

    for (const pedido of pedidos) {
      try {
        if (
          pedido.dados_pedido &&
          typeof pedido.dados_pedido === "object" &&
          Array.isArray(pedido.dados_pedido.item_list)
        ) {
          ignorados++;

          detalhes.push({
            pedido_externo_id: pedido.pedido_externo_id,
            status: "ignorado",
            mensagem: "Pedido já possui item_list em dados_pedido.",
          });

          continue;
        }

        const { data: token, error: tokenError } = await supabase
          .from("marketplace_tokens")
          .select("shop_id, access_token")
          .eq("loja_id", pedido.loja_id)
          .eq("marketplace", "shopee")
          .eq("status", "ativo")
          .single();

        if (tokenError || !token?.shop_id || !token?.access_token) {
          erros++;

          detalhes.push({
            pedido_externo_id: pedido.pedido_externo_id,
            status: "erro",
            mensagem: "Token não encontrado para a loja do pedido.",
          });

          continue;
        }

        const path = "/api/v2/order/get_order_detail";
        const timestamp = Math.floor(Date.now() / 1000);
        const shopId = String(token.shop_id);
        const accessToken = token.access_token;

        const sign = gerarAssinatura(
          String(partnerId),
          path,
          timestamp,
          String(accessToken),
          String(shopId),
          String(partnerKey)
        );

        const url = new URL(`${SHOPEE_API_URL}${path}`);

        url.searchParams.set("partner_id", String(partnerId));
        url.searchParams.set("timestamp", String(timestamp));
        url.searchParams.set("access_token", accessToken);
        url.searchParams.set("shop_id", shopId);
        url.searchParams.set("sign", sign);
        url.searchParams.set("order_sn_list", pedido.pedido_externo_id);
        url.searchParams.set(
          "response_optional_fields",
          [
            "buyer_user_id",
            "buyer_username",
            "recipient_address",
            "actual_shipping_fee",
            "estimated_shipping_fee",
            "item_list",
            "pay_time",
            "payment_method",
            "total_amount",
            "order_status",
            "shipping_carrier",
            "package_list",
            "invoice_data",
            "checkout_shipping_carrier",
            "reverse_shipping_fee",
            "cancel_reason",
            "message_to_seller",
          ].join(",")
        );

        const response = await fetch(url.toString(), {
          method: "GET",
          cache: "no-store",
        });

        const resultado = await response.json();

        if (!response.ok || resultado.error) {
          erros++;

          detalhes.push({
            pedido_externo_id: pedido.pedido_externo_id,
            status: "erro",
            mensagem: `${resultado?.error || "erro"} | ${
              resultado?.message || "Erro ao consultar get_order_detail"
            }`,
          });

          continue;
        }

        const detalhePedido = resultado?.response?.order_list?.[0];

        if (!detalhePedido) {
          erros++;

          detalhes.push({
            pedido_externo_id: pedido.pedido_externo_id,
            status: "erro",
            mensagem: "Shopee não retornou detalhes para este pedido.",
          });

          continue;
        }

        const { error: updateError } = await supabase
          .from("pedidos")
          .update({
            dados_pedido: detalhePedido,
            valor_total: detalhePedido.total_amount ?? 0,
            status: detalhePedido.order_status ?? null,
            cliente_nome: detalhePedido.buyer_username ?? null,
            atualizado_em: new Date().toISOString(),
          })
          .eq("id", pedido.id);

        if (updateError) {
          erros++;

          detalhes.push({
            pedido_externo_id: pedido.pedido_externo_id,
            status: "erro",
            mensagem: `Erro ao salvar pedido: ${updateError.message}`,
          });

          continue;
        }

        atualizados++;

        detalhes.push({
          pedido_externo_id: pedido.pedido_externo_id,
          status: "atualizado",
          mensagem: "Pedido enriquecido com sucesso.",
        });
      } catch (error) {
        erros++;

        detalhes.push({
          pedido_externo_id: pedido.pedido_externo_id,
          status: "erro",
          mensagem:
            error instanceof Error ? error.message : "Erro desconhecido.",
        });
      }
    }

    return NextResponse.json({
      sucesso: true,
      mensagem: "Enriquecimento de pedidos finalizado.",
      encontrados: pedidos.length,
      atualizados,
      ignorados,
      erros,
      detalhes,
    });
  } catch (error) {
    return NextResponse.json(
      {
        sucesso: false,
        erro:
          error instanceof Error
            ? error.message
            : "Erro desconhecido ao enriquecer pedidos.",
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return enriquecerPedidos();
}

export async function POST() {
  return enriquecerPedidos();
}