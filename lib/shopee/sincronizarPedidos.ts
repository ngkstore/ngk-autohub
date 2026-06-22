import crypto from "crypto";
import { supabase } from "@/lib/supabase";

const BASE_URL_PADRAO = "https://partner.shopeemobile.com";

// Shopee limita a janela de create_time em no máximo 15 dias por chamada.
export const JANELA_MAXIMA_DIAS = 15;

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

type ShopeeOrderResumo = {
  order_sn: string;
  order_status?: string;
  create_time?: number;
};

export type ResultadoLote = {
  jobId: string;
  status: "concluido" | "erro";
  total: number;
  mensagem: string;
  debugPrimeiroRetorno?: unknown;
};

type SyncJob = {
  id: string;
  loja_id: string;
  data_inicio: string;
  data_fim: string;
};

/**
 * Processa um único lote (sync_job): busca os pedidos da Shopee na janela do
 * lote, grava/atualiza em `pedidos` e marca o lote como concluído ou com erro.
 * Nunca lança exceção — sempre retorna um ResultadoLote.
 */
export async function processarUmLote(job: SyncJob): Promise<ResultadoLote> {
  const inicioExecucao = new Date().toISOString();

  const partnerId = process.env.SHOPEE_PARTNER_ID;
  const partnerKey = process.env.SHOPEE_PARTNER_KEY;
  const baseUrl = process.env.SHOPEE_API_BASE_URL || BASE_URL_PADRAO;

  // Marca como processando para não ser repescado em paralelo / na próxima volta.
  await supabase
    .from("sync_jobs")
    .update({ status: "processando", atualizado_em: new Date().toISOString() })
    .eq("id", job.id);

  try {
    if (!partnerId || !partnerKey) {
      throw new Error("Credenciais da Shopee não configuradas.");
    }

    const lojaId = job.loja_id;

    const { data: token, error: tokenError } = await supabase
      .from("marketplace_tokens")
      .select("*")
      .eq("loja_id", lojaId)
      .eq("marketplace", "shopee")
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
    let debugPrimeiroRetorno: unknown = null;

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
        `&page_size=${pageSize}` +
        `&response_optional_fields=order_status`;

      if (cursor) {
        url += `&cursor=${encodeURIComponent(cursor)}`;
      }

      const response = await fetch(url, { method: "GET", cache: "no-store" });
      const data = await response.json();

      if (!debugPrimeiroRetorno) {
        debugPrimeiroRetorno = data;
      }

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

      const pedidos: ShopeeOrderResumo[] = (
        data.response?.order_list || []
      ).filter((p: { order_sn?: string }) => p.order_sn);

      if (pedidos.length > 0) {
        const agoraIso = new Date().toISOString();

        const registros = pedidos.map((pedido) => {
          const statusShopee = pedido.order_status || "UNKNOWN";
          const classificacao = classificarPedido(statusShopee);

          return {
            loja_id: lojaId,
            marketplace: "shopee",
            pedido_externo_id: pedido.order_sn,
            status: statusShopee,
            data_pedido: pedido.create_time
              ? new Date(pedido.create_time * 1000).toISOString()
              : null,
            pedido_efetivado: classificacao.pedido_efetivado,
            entra_faturamento: classificacao.entra_faturamento,
            dados_pedido: pedido,
            atualizado_em: agoraIso,
          };
        });

        const orderSns = registros.map((r) => r.pedido_externo_id);

        // 1 consulta pra descobrir quais já existem (em vez de 1 por pedido).
        const { data: existentes } = await supabase
          .from("pedidos")
          .select("id, pedido_externo_id")
          .eq("loja_id", lojaId)
          .in("pedido_externo_id", orderSns);

        const mapaExistentes = new Map<string, string>(
          (existentes || []).map((e: { pedido_externo_id: string; id: string }) => [
            e.pedido_externo_id,
            e.id,
          ])
        );

        const novos = registros.filter(
          (r) => !mapaExistentes.has(r.pedido_externo_id)
        );
        const atualizar = registros.filter((r) =>
          mapaExistentes.has(r.pedido_externo_id)
        );

        // Insere todos os novos de uma vez.
        if (novos.length > 0) {
          const { error: insertError } = await supabase.from("pedidos").insert(
            novos.map((r) => ({
              ...r,
              cliente_nome: null,
              valor_total: 0,
              criado_em: agoraIso,
            }))
          );

          if (insertError) {
            throw new Error(`Erro ao inserir pedidos: ${insertError.message}`);
          }
        }

        // Atualiza só o que muda (status/flags), preservando os dados
        // enriquecidos (valor, cliente, item_list) gravados depois.
        for (const r of atualizar) {
          const { error: updateError } = await supabase
            .from("pedidos")
            .update({
              status: r.status,
              pedido_efetivado: r.pedido_efetivado,
              entra_faturamento: r.entra_faturamento,
              atualizado_em: r.atualizado_em,
            })
            .eq("id", mapaExistentes.get(r.pedido_externo_id));

          if (updateError) {
            throw new Error(`Erro ao atualizar pedido: ${updateError.message}`);
          }
        }

        totalPedidos += registros.length;
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

      if (!hasNextPage || pedidos.length === 0) {
        break;
      }
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

    const mensagem = `${totalPedidos} pedidos sincronizados no lote.`;

    await supabase.from("sincronizacoes").insert({
      loja_id: lojaId,
      marketplace: "shopee",
      tipo: "pedidos",
      status: "sucesso",
      registros_importados: totalPedidos,
      mensagem,
      iniciado_em: inicioExecucao,
      finalizado_em: new Date().toISOString(),
    });

    return {
      jobId: job.id,
      status: "concluido",
      total: totalPedidos,
      mensagem,
      debugPrimeiroRetorno,
    };
  } catch (error) {
    const mensagem =
      error instanceof Error
        ? error.message
        : "Erro desconhecido ao processar lote.";

    await supabase
      .from("sync_jobs")
      .update({ status: "erro", atualizado_em: new Date().toISOString() })
      .eq("id", job.id);

    await supabase.from("sincronizacoes").insert({
      loja_id: job.loja_id,
      marketplace: "shopee",
      tipo: "pedidos",
      status: "erro",
      registros_importados: 0,
      mensagem,
      iniciado_em: inicioExecucao,
      finalizado_em: new Date().toISOString(),
    });

    return {
      jobId: job.id,
      status: "erro",
      total: 0,
      mensagem,
    };
  }
}

/**
 * Drena os lotes pendentes da fila, processando um a um até acabar ou atingir
 * o limite de segurança (evita estourar o tempo máximo da função na Vercel).
 */
export async function processarLotesPendentes({
  maxLotes = 20,
}: { maxLotes?: number } = {}) {
  const resultados: ResultadoLote[] = [];
  let totalPedidos = 0;

  while (resultados.length < maxLotes) {
    const { data: job } = await supabase
      .from("sync_jobs")
      .select("id, loja_id, data_inicio, data_fim")
      .eq("marketplace", "shopee")
      .eq("tipo", "pedidos")
      .eq("status", "pendente")
      .order("data_inicio", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!job) break;

    const resultado = await processarUmLote(job as SyncJob);
    resultados.push(resultado);
    totalPedidos += resultado.total;
  }

  return {
    lotesProcessados: resultados.length,
    totalPedidos,
    resultados,
  };
}
