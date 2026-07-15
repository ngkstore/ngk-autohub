import crypto from "crypto";
import { supabase } from "@/lib/supabase";
import type { LojaShopee } from "@/lib/shopee/lojas";

const BASE_URL_PADRAO = "https://partner.shopeemobile.com";
const TAMANHO_LOTE = 50; // get_item_base_info aceita até 50 item_id por chamada

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

type ItemBaseInfo = {
  item_id: number;
  description?: string;
};

export type ResultadoDescricoes = {
  processados: number;
  atualizados: number;
  restantes: number;
  erro?: string;
};

// Busca a descrição de produtos que ainda não têm (get_item_base_info, em
// lotes de 50) e grava em produtos.descricao.
export async function enriquecerDescricoesPendentes({
  loja,
  limite = 200,
}: { loja: LojaShopee; limite?: number }): Promise<ResultadoDescricoes> {
  const partnerId = process.env.SHOPEE_PARTNER_ID;
  const partnerKey = process.env.SHOPEE_PARTNER_KEY;
  const baseUrl = process.env.SHOPEE_API_BASE_URL || BASE_URL_PADRAO;

  if (!partnerId || !partnerKey) {
    throw new Error("Credenciais da Shopee não configuradas.");
  }

  const accessToken = loja.accessToken;
  const shopId = loja.shopId;
  const path = "/api/v2/product/get_item_base_info";

  const { data: produtos } = await supabase
    .from("produtos")
    .select("id, item_id")
    .eq("marketplace", "shopee")
    .eq("loja_id", loja.lojaId)
    .not("item_id", "is", null)
    .is("descricao", null)
    .limit(limite);

  if (!produtos || produtos.length === 0) {
    return { processados: 0, atualizados: 0, restantes: 0 };
  }

  let atualizados = 0;
  let mensagemErro: string | undefined;

  for (let i = 0; i < produtos.length; i += TAMANHO_LOTE) {
    const bloco = produtos.slice(i, i + TAMANHO_LOTE);
    const itemIds = bloco.map((p) => String(p.item_id)).join(",");

    const timestamp = Math.floor(Date.now() / 1000);
    const sign = gerarAssinatura(
      String(partnerId),
      path,
      timestamp,
      accessToken,
      shopId,
      String(partnerKey)
    );

    const url =
      `${baseUrl}${path}` +
      `?partner_id=${partnerId}` +
      `&timestamp=${timestamp}` +
      `&access_token=${encodeURIComponent(accessToken)}` +
      `&shop_id=${shopId}` +
      `&sign=${sign}` +
      `&item_id_list=${itemIds}`;

    const response = await fetch(url, { method: "GET", cache: "no-store" });
    const data = await response.json();

    if (!response.ok || data.error) {
      mensagemErro = `${data?.error || "erro"} | ${data?.message || "get_item_base_info"}`;
      continue;
    }

    const itens: ItemBaseInfo[] = data.response?.item_list || [];
    const mapaDescricao = new Map<string, string>();
    itens.forEach((it) => {
      mapaDescricao.set(String(it.item_id), it.description || "");
    });

    for (const p of bloco) {
      const desc = mapaDescricao.get(String(p.item_id));
      const { error } = await supabase
        .from("produtos")
        .update({
          descricao: desc ?? "",
          descricao_em: new Date().toISOString(),
        })
        .eq("id", p.id);

      if (!error) atualizados++;
    }
  }

  const { count } = await supabase
    .from("produtos")
    .select("id", { count: "exact", head: true })
    .eq("marketplace", "shopee")
    .eq("loja_id", loja.lojaId)
    .not("item_id", "is", null)
    .is("descricao", null);

  return {
    processados: produtos.length,
    atualizados,
    restantes: count ?? 0,
    erro: mensagemErro,
  };
}
