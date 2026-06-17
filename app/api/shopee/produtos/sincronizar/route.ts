import { NextRequest, NextResponse } from "next/server";
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
  const baseString = `${partnerId}${path}${timestamp}${accessToken}${shopId}`;

  return crypto
    .createHmac("sha256", partnerKey)
    .update(baseString)
    .digest("hex");
}

function pegarPreco(item: any) {
  const priceInfo = item.price_info?.[0];

  if (!priceInfo) return 0;

  return (
    priceInfo.current_price ||
    priceInfo.original_price ||
    priceInfo.price ||
    0
  );
}

function pegarEstoque(item: any) {
  const stockInfo =
    item.stock_info_v2?.summary_info ||
    item.stock_info?.[0] ||
    null;

  return (
    stockInfo?.total_available_stock ||
    stockInfo?.stock ||
    stockInfo?.normal_stock ||
    0
  );
}

function montarErroShopee(titulo: string, data: any) {
  return `${titulo} | error: ${data?.error || "-"} | message: ${
    data?.message || "-"
  } | request_id: ${data?.request_id || "-"}`;
}

async function buscarDetalhesProdutos(params: {
  baseUrl: string;
  partnerId: string;
  partnerKey: string;
  accessToken: string;
  shopId: string;
  itemIds: string[];
}) {
  const {
    baseUrl,
    partnerId,
    partnerKey,
    accessToken,
    shopId,
    itemIds,
  } = params;

  const baseInfoPath = "/api/v2/product/get_item_base_info";
  const timestamp = Math.floor(Date.now() / 1000);

  const sign = gerarAssinatura(
    partnerId,
    baseInfoPath,
    timestamp,
    accessToken,
    shopId,
    partnerKey
  );

  const url =
    `${baseUrl}${baseInfoPath}` +
    `?partner_id=${partnerId}` +
    `&timestamp=${timestamp}` +
    `&access_token=${encodeURIComponent(accessToken)}` +
    `&shop_id=${shopId}` +
    `&sign=${sign}` +
    `&item_id_list=${itemIds.join(",")}`;

  const response = await fetch(url, {
    method: "GET",
    cache: "no-store",
  });

  const data = await response.json();

  if (!response.ok || data.error) {
    throw new Error(
      montarErroShopee("Erro ao buscar detalhes dos produtos na Shopee", data)
    );
  }

  return data.response?.item_list || [];
}

export async function POST(request: NextRequest) {
  const iniciadoEm = new Date().toISOString();

  try {
    const body = await request.json();
    const lojaId = body.lojaId;

    if (!lojaId) {
      return NextResponse.json(
        { sucesso: false, erro: "lojaId não informado." },
        { status: 400 }
      );
    }

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

    const { data: loja, error: lojaError } = await supabase
      .from("lojas")
      .select("*")
      .eq("id", lojaId)
      .single();

    if (lojaError || !loja) {
      return NextResponse.json(
        { sucesso: false, erro: "Loja não encontrada." },
        { status: 404 }
      );
    }

    const { data: token, error: tokenError } = await supabase
      .from("marketplace_tokens")
      .select("*")
      .eq("loja_id", lojaId)
      .single();

    if (tokenError || !token) {
      return NextResponse.json(
        { sucesso: false, erro: "Token Shopee não encontrado para esta loja." },
        { status: 404 }
      );
    }

    const accessToken = token.access_token || token.token_de_acesso;
    const shopId = token.shop_id || token.id_da_loja;

    if (!accessToken || !shopId) {
      return NextResponse.json(
        {
          sucesso: false,
          erro: "Token ou shop_id ausente.",
          debug: {
            accessTokenEncontrado: !!accessToken,
            shopIdEncontrado: !!shopId,
            tokenColumns: Object.keys(token),
          },
        },
        { status: 400 }
      );
    }

    const itemListPath = "/api/v2/product/get_item_list";
    const pageSize = 50;
    let offset = 0;
    let totalSalvos = 0;
    let totalItensEncontrados = 0;
    let continuar = true;

    while (continuar) {
      const timestamp = Math.floor(Date.now() / 1000);

      const sign = gerarAssinatura(
        String(partnerId),
        itemListPath,
        timestamp,
        String(accessToken),
        String(shopId),
        String(partnerKey)
      );

      const itemListUrl =
        `${baseUrl}${itemListPath}` +
        `?partner_id=${partnerId}` +
        `&timestamp=${timestamp}` +
        `&access_token=${encodeURIComponent(accessToken)}` +
        `&shop_id=${shopId}` +
        `&sign=${sign}` +
        `&offset=${offset}` +
        `&page_size=${pageSize}` +
        `&item_status=NORMAL`;

      const itemListResponse = await fetch(itemListUrl, {
        method: "GET",
        cache: "no-store",
      });

      const itemListData = await itemListResponse.json();

      if (!itemListResponse.ok || itemListData.error) {
        const mensagemErro = montarErroShopee(
          "Erro ao buscar lista de produtos na Shopee",
          itemListData
        );

        await supabase.from("sincronizacoes").insert({
          loja_id: lojaId,
          marketplace: "shopee",
          tipo: "produtos",
          status: "erro",
          registros_importados: totalSalvos,
          mensagem: mensagemErro,
          iniciado_em: iniciadoEm,
          finalizado_em: new Date().toISOString(),
        });

        return NextResponse.json(
          { sucesso: false, erro: mensagemErro, detalhe: itemListData },
          { status: 500 }
        );
      }

      const items = itemListData.response?.item || [];
      totalItensEncontrados += items.length;

      if (items.length === 0) {
        continuar = false;
        break;
      }

      const itemIds = items.map((item: any) => String(item.item_id));

      const produtosShopee = await buscarDetalhesProdutos({
        baseUrl,
        partnerId: String(partnerId),
        partnerKey: String(partnerKey),
        accessToken: String(accessToken),
        shopId: String(shopId),
        itemIds,
      });

      for (const item of produtosShopee) {
        const produto = {
          loja_id: lojaId,
          marketplace: "shopee",
          item_id: String(item.item_id),
          shop_id: String(shopId),
          sku: item.item_sku || String(item.item_id),
          nome: item.item_name || "Produto sem nome",
          preco: pegarPreco(item),
          estoque: pegarEstoque(item),
          status: item.item_status || "desconhecido",
          imagem_url: item.image?.image_url_list?.[0] || null,
          categoria: item.category_id ? String(item.category_id) : null,
          atualizado_em: new Date().toISOString(),
        };

        const { data: produtoExistente } = await supabase
          .from("produtos")
          .select("id")
          .eq("loja_id", lojaId)
          .eq("item_id", String(item.item_id))
          .maybeSingle();

        if (produtoExistente?.id) {
          await supabase
            .from("produtos")
            .update(produto)
            .eq("id", produtoExistente.id);
        } else {
          await supabase.from("produtos").insert({
            ...produto,
            criado_em: new Date().toISOString(),
          });
        }

        totalSalvos++;
      }

      const hasNextPage = itemListData.response?.has_next_page;
      const nextOffset = itemListData.response?.next_offset;

      if (hasNextPage && nextOffset !== undefined && nextOffset !== null) {
        offset = Number(nextOffset);
      } else if (items.length === pageSize) {
        offset += pageSize;
      } else {
        continuar = false;
      }
    }

    await supabase.from("sincronizacoes").insert({
      loja_id: lojaId,
      marketplace: "shopee",
      tipo: "produtos",
      status: "sucesso",
      registros_importados: totalSalvos,
      mensagem: `${totalSalvos} produtos sincronizados da Shopee. Itens encontrados: ${totalItensEncontrados}.`,
      iniciado_em: iniciadoEm,
      finalizado_em: new Date().toISOString(),
    });

    return NextResponse.json({
      sucesso: true,
      mensagem: `${totalSalvos} produtos sincronizados com sucesso.`,
      total: totalSalvos,
      itensEncontrados: totalItensEncontrados,
    });
  } catch (error) {
    await supabase.from("sincronizacoes").insert({
      loja_id: null,
      marketplace: "shopee",
      tipo: "produtos",
      status: "erro",
      registros_importados: 0,
      mensagem:
        error instanceof Error
          ? error.message
          : "Erro desconhecido ao sincronizar produtos.",
      iniciado_em: iniciadoEm,
      finalizado_em: new Date().toISOString(),
    });

    return NextResponse.json(
      {
        sucesso: false,
        erro:
          error instanceof Error
            ? error.message
            : "Erro desconhecido ao sincronizar produtos.",
      },
      { status: 500 }
    );
  }
}