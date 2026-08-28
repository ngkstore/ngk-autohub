import crypto from "crypto";
import { supabase } from "@/lib/supabase";
import { classificarPedido } from "@/lib/shopee/sincronizarPedidos";

const BASE_URL_PADRAO = "https://partner.shopeemobile.com";

// get_order_detail aceita até 50 order_sn por chamada.
const TAMANHO_LOTE_DETALHE = 50;

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

type ItemPedido = {
  model_discounted_price?: number;
  model_original_price?: number;
  model_quantity_purchased?: number;
};

type DetalhePedido = {
  order_sn: string;
  order_status?: string;
  total_amount?: number | string;
  buyer_username?: string;
  create_time?: number;
  pay_time?: number;
  actual_shipping_fee?: number | string;
  item_list?: ItemPedido[];
};

// Venda real = soma do preço de venda dos itens (preço com desconto do anúncio
// x quantidade). É o valor das mercadorias que o cliente paga, sem frete.
function calcularVendaItens(detalhe: DetalhePedido) {
  const itens = Array.isArray(detalhe.item_list) ? detalhe.item_list : [];

  return itens.reduce((total, item) => {
    const preco = Number(item.model_discounted_price || 0);
    const qtd = Number(item.model_quantity_purchased || 0);
    return total + preco * qtd;
  }, 0);
}

type TokenLoja = {
  id: string;
  accessToken: string;
  refreshToken: string;
  shopId: string;
};

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
    accessToken: data.access_token as string,
    refreshToken: data.refresh_token as string,
  };
}

/**
 * Busca os detalhes de um lote de até 50 order_sn na Shopee, com refresh
 * automático de token em caso de token expirado.
 */
async function buscarDetalhes(params: {
  baseUrl: string;
  partnerId: string;
  partnerKey: string;
  token: TokenLoja;
  orderSns: string[];
}): Promise<DetalhePedido[]> {
  const { baseUrl, partnerId, partnerKey, token, orderSns } = params;
  const path = "/api/v2/order/get_order_detail";

  let tentativaRefresh = false;

  while (true) {
    const timestamp = Math.floor(Date.now() / 1000);

    const sign = gerarAssinatura(
      partnerId,
      path,
      timestamp,
      token.accessToken,
      token.shopId,
      partnerKey
    );

    const url =
      `${baseUrl}${path}` +
      `?partner_id=${partnerId}` +
      `&timestamp=${timestamp}` +
      `&access_token=${encodeURIComponent(token.accessToken)}` +
      `&shop_id=${token.shopId}` +
      `&sign=${sign}` +
      `&order_sn_list=${orderSns.join(",")}` +
      `&response_optional_fields=${[
        "total_amount",
        "buyer_username",
        "order_status",
        "item_list",
        "payment_method",
        "recipient_address",
        "actual_shipping_fee",
        "pay_time",
      ].join(",")}`;

    const response = await fetch(url, { method: "GET", cache: "no-store" });
    const data = await response.json();

    const erroToken =
      data?.error === "invalid_access_token" ||
      data?.error === "token_de_acesso_inválido" ||
      String(data?.message || "").toLowerCase().includes("token");

    if ((!response.ok || data.error) && erroToken && !tentativaRefresh) {
      tentativaRefresh = true;

      const novo = await atualizarToken({
        tokenId: token.id,
        refreshToken: token.refreshToken,
        shopId: token.shopId,
        partnerId,
        partnerKey,
        baseUrl,
      });

      token.accessToken = novo.accessToken;
      token.refreshToken = novo.refreshToken;

      continue;
    }

    if (!response.ok || data.error) {
      throw new Error(
        `Erro Shopee get_order_detail: ${data?.error || "-"} | ${
          data?.message || "-"
        }`
      );
    }

    return data.response?.order_list || [];
  }
}

async function obterTokenLoja(lojaId: string): Promise<TokenLoja> {
  const { data: token, error } = await supabase
    .from("marketplace_tokens")
    .select("*")
    .eq("loja_id", lojaId)
    .eq("marketplace", "shopee")
    .eq("status", "ativo")
    .limit(1)
    .single();

  if (error || !token) {
    throw new Error("Token Shopee não encontrado para esta loja.");
  }

  if (!token.access_token || !token.refresh_token || !token.shop_id) {
    throw new Error("Access token, refresh token ou shop_id ausente.");
  }

  return {
    id: token.id,
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    shopId: String(token.shop_id),
  };
}

export type ResultadoEnriquecimento = {
  processados: number;
  atualizados: number;
  erros: number;
  restantes: number;
  viraramEfetivados?: number;
  mensagemErro?: string;
};

/**
 * Enriquece um lote de pedidos ainda sem detalhe (data_pedido = null),
 * preenchendo valor, cliente, status e a data do pedido a partir do
 * get_order_detail. Processa em blocos de 50 e grava cada pedido.
 *
 * modo `resync`: em vez dos pedidos sem detalhe, re-checa os que ficaram
 * presos em UNPAID (recentes primeiro). O sync normal cobre só janelas de
 * 15 min por create_time, então quando o comprador paga horas/dias depois
 * ninguém atualiza o status — o pedido pago congela como UNPAID e fica fora
 * do faturamento. Este modo re-busca o detalhe atual e vira os que pagaram.
 */
export async function enriquecerPedidosPendentes({
  limite = 300,
  lojaIds = null,
  resync = false,
  backfill = false,
  revisar = false,
}: { limite?: number; lojaIds?: string[] | null; resync?: boolean; backfill?: boolean; revisar?: boolean } = {}): Promise<ResultadoEnriquecimento> {
  const partnerId = process.env.SHOPEE_PARTNER_ID;
  const partnerKey = process.env.SHOPEE_PARTNER_KEY;
  const baseUrl = process.env.SHOPEE_API_BASE_URL || BASE_URL_PADRAO;

  if (!partnerId || !partnerKey) {
    throw new Error("Credenciais da Shopee não configuradas.");
  }

  // Sem loja no escopo (conta sem lojas) -> nada a fazer.
  if (lojaIds && lojaIds.length === 0) {
    return { processados: 0, atualizados: 0, erros: 0, restantes: 0 };
  }

  // Pedidos-alvo: reais (não fake SH-). No modo normal, os sem detalhe
  // (data_pedido null). No modo resync, os presos em UNPAID (recentes 1o).
  // lojaIds null = todas as lojas (cron); [...] = só as lojas da conta.
  let query = supabase
    .from("pedidos")
    .select("id, loja_id, pedido_externo_id")
    .eq("marketplace", "shopee")
    .not("pedido_externo_id", "like", "SH-%");
  if (resync) {
    // Recentes primeiro: os pagamentos caem nos pedidos dos últimos ~2 dias
    // (boleto/pix), então re-checar os mais novos pega os que viraram pago
    // rápido. Os UNPAID antigos (>2 dias) são abandonados — não precisam de
    // re-checagem. (O backlog histórico já foi limpo.)
    query = query.eq("status", "UNPAID").order("data_pedido", {
      ascending: false,
      nullsFirst: false,
    }).is("origem", null);
  } else if (revisar) {
    // Revisão de status: pedidos efetivados presos num status NÃO-terminal
    // (ex.: "READY_TO_SHIP" há semanas) — o sistema não re-sincroniza status de
    // pedido antigo, então cancelamento tardio ficava contado como pago. Re-puxa
    // o status atual; se virou CANCELLED, sai do faturamento. Recentes primeiro.
    query = query
      .eq("pedido_efetivado", true)
      .is("origem", null)
      .not("data_pedido", "is", null)
      .not("status", "in", "(COMPLETED,CANCELLED,TO_RETURN)")
      .order("data_pedido", { ascending: false, nullsFirst: false });
  } else if (backfill) {
    // Drenador do backfill histórico: só os pedidos antigos importados
    // (origem='backfill') sem detalhe. Roda por um endpoint próprio, devagar,
    // separado do cron ao vivo.
    query = query.is("data_pedido", null).eq("origem", "backfill");
  } else {
    // Ao vivo: ignora os do backfill pra não starvar o faturamento de hoje.
    query = query.is("data_pedido", null).is("origem", null);
  }
  if (lojaIds) query = query.in("loja_id", lojaIds);
  const { data: pedidos } = await query.limit(limite);

  if (!pedidos || pedidos.length === 0) {
    return { processados: 0, atualizados: 0, erros: 0, restantes: 0 };
  }

  // Agrupa por loja (cada loja tem seu token).
  const porLoja = new Map<string, typeof pedidos>();
  for (const p of pedidos) {
    const lista = porLoja.get(p.loja_id) || [];
    lista.push(p);
    porLoja.set(p.loja_id, lista);
  }

  let atualizados = 0;
  let erros = 0;
  let viraramEfetivados = 0;
  let mensagemErro: string | undefined;

  for (const [lojaId, lista] of porLoja) {
    let token: TokenLoja;
    try {
      token = await obterTokenLoja(lojaId);
    } catch (e) {
      erros += lista.length;
      mensagemErro = e instanceof Error ? e.message : "Erro ao obter token.";
      continue;
    }

    // Mapa order_sn -> id do pedido no banco.
    const mapaIds = new Map(lista.map((p) => [p.pedido_externo_id, p.id]));
    const orderSns = lista.map((p) => p.pedido_externo_id);

    for (let i = 0; i < orderSns.length; i += TAMANHO_LOTE_DETALHE) {
      const bloco = orderSns.slice(i, i + TAMANHO_LOTE_DETALHE);

      let detalhes: DetalhePedido[];
      try {
        detalhes = await buscarDetalhes({
          baseUrl,
          partnerId,
          partnerKey,
          token,
          orderSns: bloco,
        });
      } catch (e) {
        erros += bloco.length;
        mensagemErro = e instanceof Error ? e.message : "Erro ao buscar detalhes.";
        continue;
      }

      for (const detalhe of detalhes) {
        const id = mapaIds.get(detalhe.order_sn);
        if (!id) continue;

        const statusShopee = detalhe.order_status || "UNKNOWN";
        const classificacao = classificarPedido(statusShopee);

        // Venda real pelos itens; se não houver item_list, cai no total_amount.
        const vendaItens = calcularVendaItens(detalhe);
        const valorVenda =
          vendaItens > 0 ? vendaItens : Number(detalhe.total_amount ?? 0);

        // Campos leves (sempre). No RESYNC paramos aqui: o pedido já tem
        // dados_pedido/cliente/data — reescrever a coluna gorda dados_pedido
        // a cada re-checagem gera bloat/WAL e satura o Nano (autovacuum).
        const payload: Record<string, unknown> = {
          status: statusShopee,
          pedido_efetivado: classificacao.pedido_efetivado,
          entra_faturamento: classificacao.entra_faturamento,
          atualizado_em: new Date().toISOString(),
        };
        if (!revisar) {
          // revisar mexe SÓ em status/flags — preserva valor_total e
          // data_pagamento que o escrow já gravou (mais precisos que o detalhe).
          payload.valor_total = valorVenda;
          payload.data_pagamento = detalhe.pay_time
            ? new Date(detalhe.pay_time * 1000).toISOString()
            : null;
        }
        if (!resync && !revisar) {
          // Enriquecimento inicial (pedido sem detalhe): grava tudo, 1ª vez.
          payload.dados_pedido = detalhe;
          payload.cliente_nome = detalhe.buyer_username ?? null;
          payload.data_pedido = detalhe.create_time
            ? new Date(detalhe.create_time * 1000).toISOString()
            : null;
        }
        const { error: updateError } = await supabase
          .from("pedidos")
          .update(payload)
          .eq("id", id);

        if (updateError) {
          erros++;
          mensagemErro = updateError.message;
        } else {
          atualizados++;
          // resync: todos entraram como UNPAID; se agora classifica como
          // efetivado, é um pedido pago que estava congelado fora do faturamento.
          if (resync && classificacao.pedido_efetivado) viraramEfetivados++;
        }
      }
    }
  }

  // Quantos ainda faltam no total (depois deste lote).
  let countQuery = supabase
    .from("pedidos")
    .select("id", { count: "exact", head: true })
    .eq("marketplace", "shopee")
    .not("pedido_externo_id", "like", "SH-%");
  if (resync) {
    countQuery = countQuery.eq("status", "UNPAID").is("origem", null);
  } else if (revisar) {
    countQuery = countQuery
      .eq("pedido_efetivado", true)
      .is("origem", null)
      .not("data_pedido", "is", null)
      .not("status", "in", "(COMPLETED,CANCELLED,TO_RETURN)");
  } else if (backfill) {
    countQuery = countQuery.is("data_pedido", null).eq("origem", "backfill");
  } else {
    countQuery = countQuery.is("data_pedido", null).is("origem", null);
  }
  if (lojaIds) countQuery = countQuery.in("loja_id", lojaIds);
  const { count } = await countQuery;

  return {
    processados: pedidos.length,
    atualizados,
    erros,
    restantes: count ?? 0,
    viraramEfetivados,
    mensagemErro,
  };
}
