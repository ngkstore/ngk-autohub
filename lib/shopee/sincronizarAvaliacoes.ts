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

type ComentarioShopee = {
  comment_id: number;
  comment?: string;
  buyer_username?: string;
  order_sn?: string;
  item_id?: number;
  create_time?: number;
  rating_star?: number;
  comment_reply?: { reply?: string };
};

export type ResultadoSyncAvaliacoes = {
  processados: number;
  novosOuAtualizados: number;
  nextCursor: string;
  done: boolean;
  paginasUsadas: number;
  erro?: string;
};

// Sincroniza avaliações da Shopee a partir de um cursor, processando até
// `maxPaginas` páginas por chamada (o cliente repassa o nextCursor até done).
// Se `itemId` for informado, busca os comentários daquele produto (necessário
// para alcançar o histórico completo — a consulta da loja inteira tem teto).
export async function sincronizarAvaliacoesPagina({
  loja,
  cursor = "",
  maxPaginas = 40,
  itemId,
}: {
  loja: LojaShopee;
  cursor?: string;
  maxPaginas?: number;
  itemId?: number;
}): Promise<ResultadoSyncAvaliacoes> {
  const partnerId = process.env.SHOPEE_PARTNER_ID;
  const partnerKey = process.env.SHOPEE_PARTNER_KEY;
  const baseUrl = process.env.SHOPEE_API_BASE_URL || BASE_URL_PADRAO;

  if (!partnerId || !partnerKey) {
    throw new Error("Credenciais da Shopee não configuradas.");
  }

  const lojaId = loja.lojaId;
  const shopId = loja.shopId;
  const accessToken = loja.accessToken;
  const path = "/api/v2/product/get_comment";

  // Mapa item_id -> nome do produto (para preencher nome_produto).
  const { data: produtos } = await supabase
    .from("produtos")
    .select("item_id, nome")
    .eq("loja_id", lojaId);

  const mapaProdutos = new Map<string, string>(
    (produtos || [])
      .filter((p) => p.item_id)
      .map((p) => [String(p.item_id), p.nome as string])
  );

  let cursorAtual = cursor;
  let processados = 0;
  let novosOuAtualizados = 0;
  let done = false;
  let paginasUsadas = 0;

  for (let pagina = 0; pagina < maxPaginas; pagina++) {
    paginasUsadas++;
    const timestamp = Math.floor(Date.now() / 1000);
    const sign = gerarAssinatura(
      String(partnerId),
      path,
      timestamp,
      accessToken,
      shopId,
      String(partnerKey)
    );

    const url = new URL(`${baseUrl}${path}`);
    url.searchParams.set("partner_id", String(partnerId));
    url.searchParams.set("timestamp", String(timestamp));
    url.searchParams.set("access_token", accessToken);
    url.searchParams.set("shop_id", shopId);
    url.searchParams.set("sign", sign);
    url.searchParams.set("cursor", cursorAtual);
    url.searchParams.set("page_size", "100");
    if (itemId) url.searchParams.set("item_id", String(itemId));

    const response = await fetch(url.toString(), {
      method: "GET",
      cache: "no-store",
    });
    const data = await response.json();

    if (!response.ok || data.error) {
      return {
        processados,
        novosOuAtualizados,
        nextCursor: cursorAtual,
        done: false,
        paginasUsadas,
        erro: `${data?.error || "erro"} | ${data?.message || "get_comment"}`,
      };
    }

    const lista: ComentarioShopee[] =
      data.response?.comment_list ||
      data.response?.item_comment_list ||
      [];

    if (lista.length > 0) {
      const registros = lista
        .filter((c) => c.comment_id)
        .map((c) => {
          const dataIso = c.create_time
            ? new Date(c.create_time * 1000).toISOString()
            : null;
          const respondida = !!c.comment_reply?.reply;

          return {
            loja_id: lojaId,
            marketplace: "shopee",
            comment_id: c.comment_id,
            item_id: c.item_id ?? null,
            order_sn: c.order_sn ?? null,
            nome_produto:
              (c.item_id && mapaProdutos.get(String(c.item_id))) ||
              "Produto Shopee",
            nome_cliente: c.buyer_username ?? null,
            avaliacao: c.rating_star ?? null,
            comentario: c.comment ?? "",
            data_avaliacao: dataIso,
            ja_respondida: respondida,
            resposta_shopee: c.comment_reply?.reply ?? null,
            status: respondida ? "respondida" : "pendente",
            criado_em: dataIso,
          };
        });

      const { error: upsertError } = await supabase
        .from("avaliacoes")
        .upsert(registros, { onConflict: "comment_id" });

      if (upsertError) {
        return {
          processados,
          novosOuAtualizados,
          nextCursor: cursorAtual,
          done: false,
          paginasUsadas,
          erro: `Erro ao salvar avaliações: ${upsertError.message}`,
        };
      }

      processados += lista.length;
      novosOuAtualizados += registros.length;
    }

    const more = !!data.response?.more;
    cursorAtual = data.response?.next_cursor || "";

    if (!more || lista.length === 0) {
      done = true;
      break;
    }
  }

  return {
    processados,
    novosOuAtualizados,
    nextCursor: cursorAtual,
    done,
    paginasUsadas,
  };
}
