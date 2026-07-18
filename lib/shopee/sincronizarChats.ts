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

  for (const c of conversas) {
    const conversationId = String(c.conversation_id);
    const toId = String(c.to_id);
    const precisaResposta = String(c.latest_message_from_id) === toId;

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

      await supabase
        .from("chat_mensagens")
        .upsert(registros, { onConflict: "message_id" });

      totalMensagens += registros.length;
    }

    await supabase.from("chat_conversas").upsert(
      {
        conversation_id: conversationId,
        loja_id: loja.lojaId,
        to_id: toId,
        to_name: c.to_name ?? null,
        item_id: itemIdConversa,
        latest_message_id: c.latest_message_id
          ? String(c.latest_message_id)
          : null,
        ultimo_remetente: precisaResposta ? "cliente" : "loja",
        precisa_resposta: precisaResposta,
        unread_count: c.unread_count ?? 0,
        ultima_mensagem: c.latest_message_content?.text ?? "",
        ultima_mensagem_ts: c.last_message_timestamp ?? null,
        atualizado_em: new Date().toISOString(),
      },
      { onConflict: "conversation_id" }
    );
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
