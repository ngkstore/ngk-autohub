import { NextResponse } from "next/server";
import crypto from "crypto";
import { supabase } from "@/lib/supabase";

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

function gerarAssinaturaSimples(
  partnerId: string,
  path: string,
  timestamp: number,
  partnerKey: string
) {
  return crypto
    .createHmac("sha256", partnerKey)
    .update(`${partnerId}${path}${timestamp}`)
    .digest("hex");
}

function classificarPedido(status: string) {
  const s = status?.toUpperCase() || "";

  const efetivados = [
    "READY_TO_SHIP",
    "PROCESSED",
    "SHIPPED",
    "TO_CONFIRM_RECEIVE",
    "COMPLETED",
  ];

  const faturamento = ["TO_CONFIRM_RECEIVE", "COMPLETED"];

  return {
    pedido_efetivado: efetivados.includes(s),
    entra_faturamento: faturamento.includes(s),
  };
}

async function atualizarToken(params: {
  tokenId: string;
  refreshToken: string;
  shopId: string;
  partnerId: string;
  partnerKey: string;
  baseUrl: string;
}) {
  const path = "/api/v2/auth/access_token/get";
  const timestamp = Math.floor(Date.now() / 1000);

  const sign = gerarAssinaturaSimples(
    params.partnerId,
    path,
    timestamp,
    params.partnerKey
  );

  const url =
    `${params.baseUrl}${path}` +
    `?partner_id=${params.partnerId}` +
    `&timestamp=${timestamp}` +
    `&sign=${sign}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      refresh_token: params.refreshToken,
      partner_id: Number(params.partnerId),
      shop_id: Number(params.shopId),
    }),
  });

  const data = await response.json();

  if (!response.ok || data.error) {
    throw new Error(
      `Erro ao atualizar token Shopee: ${data?.error || "-"} | ${
        data?.message || "-"
      }`
    );
  }

  await supabase
    .from("marketplace_tokens")
    .update({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      shop_id: String(params.shopId),
      expire_in: data.expire_in,
      status: "ativo",
      atualizado_em: new Date().toISOString(),
    })
    .eq("id", params.tokenId);

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
  };
}

async function processarLote() {
  const inicioExecucao = new Date().toISOString();

  try {
    const partnerId = process.env.SHOPEE_PARTNER_ID;
    const partnerKey = process.env.SHOPEE_PARTNER_KEY;
    const baseUrl =
      process.env.SHOPEE_API_BASE_URL || "https://partner.shopeemobile.com";

    if (!partnerId || !partnerKey) {
      return NextResponse.json(
        { sucesso: false, erro: "Credenciais da Shopee não configuradas." },
        { status: 500 }
      );
    }

    const { data: job } = await supabase
      .from("sync_jobs")
      .select("*")
      .eq("marketplace", "shopee")
      .eq("tipo", "pedidos")
      .eq("status", "pendente")
      .order("data_inicio", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!job) {
      return NextResponse.json({
        sucesso: true,
        mensagem: "Nenhum lote pendente para processar.",
      });
    }

    await supabase
      .from("sync_jobs")
      .update({ status: "processando", atualizado_em: new Date().toISOString() })
      .eq("id", job.id);

    const lojaId = job.loja_id;

    const { data: token, error: tokenError } = await supabase
      .from("marketplace_tokens")
      .select("*")
      .eq("loja_id", lojaId)
      .eq("status", "ativo")
      .limit(1)
      .single();

    if (tokenError || !token) {
      throw new Error("Token Shopee não encontrado para esta loja.");
    }

    let accessToken = token.access_token;
    let refreshToken = token.refresh_token;
    const shopId = String(token.shop_id);

    if (!accessToken || !refreshToken || !shopId) {
      throw new Error("Access token, refresh token ou shop_id ausente.");
    }

    const timeFrom = Math.floor(new Date(job.data_inicio).getTime() / 1000);
    const timeTo = Math.floor(new Date(job.data_fim).getTime() / 1000);

    const path = "/api/v2/order/get_order_list";
    const pageSize = 50;

    let cursor = "";
    let hasNextPage = true;
    let totalPedidos = 0;
    let tentativaRefresh = false;

    while (hasNextPage) {
      const timestamp = Math.floor(Date.now() / 1000);

      const sign = gerarAssinatura(
        String(partnerId),
        path,
        timestamp,
        String(accessToken),
        String(shopId),
        String(partnerKey)
      );

      let url =
        `${baseUrl}${path}` +
        `?partner_id=${partnerId}` +
        `&timestamp=${timestamp}` +
        `&access_token=${encodeURIComponent(accessToken)}` +
        `&shop_id=${shopId}` +
        `&sign=${sign}` +
        `&time_range_field=create_time` +
        `&time_from=${timeFrom}` +
        `&time_to=${timeTo}` +
        `&page_size=${pageSize}`;

      if (cursor) url += `&cursor=${encodeURIComponent(cursor)}`;

      const response = await fetch(url, { method: "GET", cache: "no-store" });
      const data = await response.json();

      const erroToken =
        data?.error === "invalid_access_token" ||
        data?.error === "token_de_acesso_inválido" ||
        String(data?.message || "").toLowerCase().includes("token");

      if ((!response.ok || data.error) && erroToken && !tentativaRefresh) {
        tentativaRefresh = true;

        const novoToken = await atualizarToken({
          tokenId: token.id,
          refreshToken,
          shopId,
          partnerId: String(partnerId),
          partnerKey: String(partnerKey),
          baseUrl,
        });

        accessToken = novoToken.accessToken;
        refreshToken = novoToken.refreshToken;

        continue;
      }

      if (!response.ok || data.error) {
        throw new Error(
          `Erro Shopee get_order_list: ${data?.error || "-"} | ${
            data?.message || "-"
          }`
        );
      }

      const pedidos = data.response?.order_list || [];

      for (const pedido of pedidos) {
        const orderSn = pedido.order_sn;
        const statusShopee = pedido.order_status || "UNKNOWN";
        const classificacao = classificarPedido(statusShopee);

        const registro = {
          loja_id: lojaId,
          mercado: "Shopee",
          marketplace: "shopee",
          pedido_externo_id: orderSn,
          nome_do_cliente: null,
          valor_total: 0,
          status: statusShopee,
          data_pedido: pedido.create_time
            ? new Date(pedido.create_time * 1000).toISOString()
            : null,
          pedido_efetivado: classificacao.pedido_efetivado,
          entra_faturamento: classificacao.entra_faturamento,
          dados_pedido: pedido,
          atualizado_em: new Date().toISOString(),
        };

        const { data: existente } = await supabase
          .from("pedidos")
          .select("id")
          .eq("loja_id", lojaId)
          .eq("pedido_externo_id", orderSn)
          .maybeSingle();

        if (existente?.id) {
          await supabase.from("pedidos").update(registro).eq("id", existente.id);
        } else {
          await supabase.from("pedidos").insert({
            ...registro,
            criado_em: new Date().toISOString(),
          });
        }

        totalPedidos++;
      }

      hasNextPage = !!data.response?.more;
      cursor = data.response?.next_cursor || "";

      await supabase
        .from("sync_jobs")
        .update({
          progresso: totalPedidos,
          total_registros: totalPedidos,
          atualizado_em: new Date().toISOString(),
        })
        .eq("id", job.id);

      if (!hasNextPage || pedidos.length === 0) break;
    }

    await supabase
      .from("sync_jobs")
      .update({
        status: "concluido",
        progresso: totalPedidos,
        total_registros: totalPedidos,
        atualizado_em: new Date().toISOString(),
      })
      .eq("id", job.id);

    await supabase.from("sincronizacoes").insert({
      loja_id: lojaId,
      marketplace: "shopee",
      tipo: "pedidos",
      status: "sucesso",
      registros_importados: totalPedidos,
      mensagem: `${totalPedidos} pedidos sincronizados no lote.`,
      iniciado_em: inicioExecucao,
      finalizado_em: new Date().toISOString(),
    });

    return NextResponse.json({
      sucesso: true,
      mensagem: `${totalPedidos} pedidos sincronizados no lote.`,
      jobId: job.id,
      total: totalPedidos,
    });
  } catch (error) {
    await supabase.from("sincronizacoes").insert({
      marketplace: "shopee",
      tipo: "pedidos",
      status: "erro",
      registros_importados: 0,
      mensagem:
        error instanceof Error
          ? error.message
          : "Erro desconhecido ao processar lote.",
      iniciado_em: inicioExecucao,
      finalizado_em: new Date().toISOString(),
    });

    return NextResponse.json(
      {
        sucesso: false,
        erro:
          error instanceof Error
            ? error.message
            : "Erro desconhecido ao processar lote.",
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return processarLote();
}

export async function POST() {
  return processarLote();
}