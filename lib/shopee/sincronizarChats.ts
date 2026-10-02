import crypto from "crypto";
import { supabase } from "@/lib/supabase";
import type { LojaShopee } from "@/lib/shopee/lojas";

const BASE_URL_PADRAO = "https://partner.shopeemobile.com";

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

type Token = { accessToken: string; shopId: string };

async function chamar(
  path: string,
  params: Record<string, string>,
  token: Token
) {
  const partnerId = process.env.SHOPEE_PARTNER_ID!;
  const partnerKey = process.env.SHOPEE_PARTNER_KEY!;
  const baseUrl = process.env.SHOPEE_API_BASE_URL || BASE_URL_PADRAO;
  const timestamp = Math.floor(Date.now() / 1000);

  const sign = gerarAssinatura(
    partnerId,
    path,
    timestamp,
    token.accessToken,
    token.shopId,
    partnerKey
  );

  const url = new URL(`${baseUrl}${path}`);
  url.searchParams.set("partner_id", partnerId);
  url.searchParams.set("timestamp", String(timestamp));
  url.searchParams.set("access_token", token.accessToken);
  url.searchParams.set("shop_id", token.shopId);
  url.searchParams.set("sign", sign);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const response = await fetch(url.toString(), {
    method: "GET",
    cache: "no-store",
  });
  return response.json();
}

type MensagemShopee = {
  message_id: string;
  from_shop_id?: number;
  content?: { text?: string };
  source_content?: { item_id?: number };
  created_timestamp?: number;
};

// Segundos (a API manda created_timestamp em segundos; normaliza se vier em ms/ns).
function emSegundos(ts: number | undefined) {
  const n = Number(ts || 0);
  if (n > 1e14) return n / 1e9;
  if (n > 1e11) return n / 1e3;
  return n;
}

// A lista de conversas diz "a loja falou por último", mas pode ter sido só a
// AUTO-RESPOSTA da Shopee ("Seja bem-vindo…", "Olá Amigo(a)…"), que sai no
// mesmo segundo da mensagem do cliente. Nesse caso o cliente continua sem
// resposta de verdade — e o robô nunca via a conversa. Devolve o texto da
// última mensagem do cliente quando ela só recebeu auto-resposta (≤2s depois).
function clienteSoComAutoResposta(msgs: MensagemShopee[], shopId: string) {
  const doCliente = msgs.filter((m) => String(m.from_shop_id) !== shopId);
  if (doCliente.length === 0) return null;
  const ultima = doCliente.reduce((a, b) =>
    emSegundos(b.created_timestamp) >= emSegundos(a.created_timestamp) ? b : a
  );
  const tsCliente = emSegundos(ultima.created_timestamp);
  // Só as recentes: responder dias depois não ajuda (e a Shopee nem deixa).
  if (!tsCliente || Date.now() / 1000 - tsCliente > 72 * 3600) return null;

  const daLojaDepois = msgs.filter(
    (m) =>
      String(m.from_shop_id) === shopId &&
      emSegundos(m.created_timestamp) >= tsCliente
  );
  if (daLojaDepois.length === 0) return null; // sem dado pra contrariar a lista
  const teveRespostaReal = daLojaDepois.some(
    (m) => emSegundos(m.created_timestamp) - tsCliente > 2
  );
  return teveRespostaReal ? null : { texto: ultima.content?.text ?? "" };
}

export type ResultadoSyncChat = {
  conversas: number;
  mensagens: number;
  nextTimestamp: string;
  done: boolean;
  erro?: string;
};

// Sincroniza uma página de conversas e, para cada uma, as mensagens recentes.
// Guarda quem falou por último (precisa_resposta) e o item da conversa.
export async function sincronizarChatsPagina({
  loja,
  nextTimestamp = "",
  maxConversas = 25,
  direction = "older",
  tipo = "all",
}: {
  loja: LojaShopee;
  nextTimestamp?: string;
  maxConversas?: number;
  direction?: "latest" | "older";
  tipo?: "all" | "unread";
}): Promise<ResultadoSyncChat> {
  const token: Token = { accessToken: loja.accessToken, shopId: loja.shopId };

  const params: Record<string, string> = {
    type: tipo,
    direction,
    page_size: String(maxConversas),
  };
  if (nextTimestamp) params.next_timestamp = nextTimestamp;

  const lista = await chamar(
    "/api/v2/sellerchat/get_conversation_list",
    params,
    token
  );

  if (lista?.error) {
    return {
      conversas: 0,
      mensagens: 0,
      nextTimestamp,
      done: false,
      erro: `${lista.error} | ${lista.message || "get_conversation_list"}`,
    };
  }

  const conversas = lista?.response?.conversations || [];
  let totalMensagens = 0;

  // Como estas conversas estão no banco: pra pular as que não mudaram e pra
  // encerrar a escalada quando um humano responde pelo Seller Center.
  const idsPagina = conversas.map((c: { conversation_id: unknown }) =>
    String(c.conversation_id)
  );
  const antes = new Map<
    string,
    {
      latest_message_id: string | null;
      escalada: boolean | null;
      robo_msg_id: string | null;
      resposta_ia: string | null;
    }
  >();
  if (idsPagina.length > 0) {
    const { data: linhas } = await supabase
      .from("chat_conversas")
      .select("conversation_id, latest_message_id, escalada, robo_msg_id, resposta_ia")
      .eq("marketplace", "shopee")
      .in("conversation_id", idsPagina);
    (linhas || []).forEach((l) => antes.set(String(l.conversation_id), l));
  }

  for (const c of conversas) {
    const conversationId = String(c.conversation_id);
    const toId = String(c.to_id);
    const latestId = c.latest_message_id ? String(c.latest_message_id) : null;
    const ant = antes.get(conversationId);

    // Nada de novo desde o último sync: não baixa as mensagens de novo. O
    // sync relia 60 conversas por loja a cada rodada e levava mais que os
    // 2 min do cron — o cliente esperava esse tempo todo antes do robô agir.
    if (ant && latestId && ant.latest_message_id === latestId) continue;

    const ultimaEhCliente = String(c.latest_message_from_id) === toId;
    let precisaResposta = ultimaEhCliente;
    let ultimaMensagem: string = c.latest_message_content?.text ?? "";

    // Mensagens recentes da conversa (uma página).
    const msgs = await chamar(
      "/api/v2/sellerchat/get_message",
      { conversation_id: conversationId, page_size: "50" },
      token
    );

    const listaMsgs: MensagemShopee[] = msgs?.response?.messages || [];
    let itemIdConversa: number | null = null;

    if (listaMsgs.length > 0) {
      const registros = listaMsgs
        .filter((m) => m.message_id)
        .map((m) => {
          const itemId = m.source_content?.item_id ?? null;
          if (itemId) itemIdConversa = itemId;
          return {
            message_id: String(m.message_id),
            conversation_id: conversationId,
            loja_id: loja.lojaId,
            de_loja: String(m.from_shop_id) === token.shopId,
            texto: m.content?.text ?? "",
            item_id: itemId,
            created_timestamp: m.created_timestamp ?? null,
          };
        });

      const { error: erroMsgs } = await supabase
        .from("chat_mensagens")
        .upsert(registros, { onConflict: "message_id" });
      if (erroMsgs) {
        return {
          conversas: 0,
          mensagens: totalMensagens,
          nextTimestamp,
          done: false,
          erro: `upsert chat_mensagens: ${erroMsgs.message}`,
        };
      }

      totalMensagens += registros.length;

      if (!ultimaEhCliente) {
        const soAuto = clienteSoComAutoResposta(listaMsgs, token.shopId);
        if (soAuto) {
          precisaResposta = true;
          ultimaMensagem = soAuto.texto;
        }
      }
    }

    // Loja falou por último e NÃO foi o robô -> um humano respondeu: encerra a
    // escalada (sem isso ela ficava pra sempre em "Atendimento Pendente").
    const foiORobo = ant?.robo_msg_id
      ? latestId === ant.robo_msg_id
      : (c.latest_message_content?.text ?? "").trim() ===
        (ant?.resposta_ia || "").trim();
    const humanoRespondeu = !!ant?.escalada && !precisaResposta && !foiORobo;

    // PK de chat_conversas é (marketplace, conversation_id) desde a chegada do
    // chat TikTok — o onConflict TEM de casar com esse índice único, senão o
    // upsert inteiro falha e o robô fica cego (foi um incidente real em 30/09).
    const { error: erroUpsert } = await supabase.from("chat_conversas").upsert(
      {
        marketplace: "shopee",
        conversation_id: conversationId,
        loja_id: loja.lojaId,
        to_id: toId,
        to_name: c.to_name ?? null,
        // só grava quando achou: senão apagava o item já conhecido da conversa
        ...(itemIdConversa ? { item_id: itemIdConversa } : {}),
        latest_message_id: latestId,
        ultimo_remetente: precisaResposta ? "cliente" : "loja",
        precisa_resposta: precisaResposta,
        unread_count: c.unread_count ?? 0,
        ultima_mensagem: ultimaMensagem,
        ultima_mensagem_ts: c.last_message_timestamp ?? null,
        atualizado_em: new Date().toISOString(),
        ...(humanoRespondeu ? { escalada: false } : {}),
      },
      { onConflict: "marketplace,conversation_id" }
    );
    if (erroUpsert) {
      return {
        conversas: 0,
        mensagens: totalMensagens,
        nextTimestamp,
        done: false,
        erro: `upsert chat_conversas: ${erroUpsert.message}`,
      };
    }
  }

  const cursor = lista?.response?.page_result?.next_cursor;
  const more = !!lista?.response?.page_result?.more;
  const proximo = cursor?.next_message_time_nano
    ? String(cursor.next_message_time_nano)
    : "";

  return {
    conversas: conversas.length,
    mensagens: totalMensagens,
    nextTimestamp: proximo,
    done: !more || conversas.length === 0,
  };
}
