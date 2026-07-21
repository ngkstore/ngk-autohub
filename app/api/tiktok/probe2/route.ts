import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { chamarTikTok } from "@/lib/tiktok/client";

export const dynamic = "force-dynamic";
export const maxDuration = 90;

// Sondagem refinada: agora COM os parâmetros exigidos, p/ cravar avaliações
// (ler + responder) e ver se o chat já libera mesmo "em análise".
export async function GET() {
  const { data: token } = await supabase
    .from("marketplace_tokens")
    .select("access_token, shop_cipher")
    .eq("marketplace", "tiktok_shop")
    .eq("status", "ativo")
    .limit(1)
    .maybeSingle();

  if (!token?.access_token) {
    return NextResponse.json({ sucesso: false, erro: "Conecte o TikTok primeiro." });
  }
  const acc = token.access_token as string;
  const cipher = (token.shop_cipher as string) || undefined;

  async function testar(
    nome: string,
    path: string,
    method: "GET" | "POST",
    query?: Record<string, string>,
    body?: unknown
  ) {
    try {
      const r = await chamarTikTok(path, {
        method,
        accessToken: acc,
        shopCipher: cipher,
        query,
        body,
      });
      // devolve o data também quando funciona, p/ ver os campos
      return {
        nome,
        path,
        code: r?.code,
        message: String(r?.message || "").slice(0, 140),
        amostra_data: r?.code === 0 ? r?.data : undefined,
      };
    } catch (e) {
      return { nome, path, erro: e instanceof Error ? e.message.slice(0, 80) : "erro" };
    }
  }

  // pega 1 product_id (pode ser necessário p/ avaliações)
  let productId = "";
  try {
    const prod = await chamarTikTok("/product/202309/products/search", {
      method: "POST",
      accessToken: acc,
      shopCipher: cipher,
      query: { page_size: "1" },
      body: { page_size: 1 },
    });
    productId = prod?.data?.products?.[0]?.id || "";
  } catch {
    /* noop */
  }

  const hoje = new Date();
  const seteDias = new Date(hoje.getTime() - 7 * 86400000);
  const ymd = (d: Date) => d.toISOString().slice(0, 10);

  const resultados = [
    // AVALIAÇÕES — ler
    await testar("reviews GET page_size", "/product/202309/products/reviews", "GET", {
      page_size: "10",
    }),
    await testar(
      "reviews GET com product_id",
      "/product/202309/products/reviews",
      "GET",
      productId ? { page_size: "10", product_id: productId } : { page_size: "10" }
    ),
    // AVALIAÇÕES — responder (chutes de caminho)
    await testar(
      "reviews reply A",
      "/product/202309/products/reviews/reply",
      "POST",
      undefined,
      { review_id: "0", reply: "teste" }
    ),
    await testar(
      "reviews reply B",
      "/product/202309/reviews/reply",
      "POST",
      undefined,
      { review_id: "0", reply: "teste" }
    ),
    // CHAT — testa se libera mesmo em análise
    await testar("conversations com page_size", "/customer_service/202309/conversations", "GET", {
      page_size: "10",
    }),
    // ANALYTICS — com datas
    await testar("analytics shop", "/analytics/202405/shop/performance", "GET", {
      start_date_ge: ymd(seteDias),
      end_date_lt: ymd(hoje),
    }),
  ];

  return NextResponse.json({
    sucesso: true,
    product_id_usado: productId || "(não obtido)",
    resultados,
  });
}
