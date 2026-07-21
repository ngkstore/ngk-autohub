import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { chamarTikTok } from "@/lib/tiktok/client";

export const dynamic = "force-dynamic";
export const maxDuration = 90;

// Sondagem ampla: testa vários endpoints do TikTok Shop na conta conectada e
// reporta o code/message de cada um. Assim descobrimos o que está ATIVO
// (code 0), o que existe mas FALTA ESCOPO (105005) e o que NÃO EXISTE.
export async function GET() {
  const { data: token } = await supabase
    .from("marketplace_tokens")
    .select("access_token, shop_cipher, shop_id")
    .eq("marketplace", "tiktok_shop")
    .eq("status", "ativo")
    .limit(1)
    .maybeSingle();

  if (!token?.access_token) {
    return NextResponse.json({ sucesso: false, erro: "Conecte o TikTok primeiro." });
  }

  const acc = token.access_token as string;
  const cipher = (token.shop_cipher as string) || undefined;

  // path, método, corpo. Vários são "chutes" de caminho — o code diz se existe.
  const candidatos: {
    nome: string;
    path: string;
    method: "GET" | "POST";
    body?: unknown;
    cipher?: boolean;
  }[] = [
    { nome: "shops (sanity)", path: "/authorization/202309/shops", method: "GET" },
    { nome: "orders/search", path: "/order/202309/orders/search", method: "POST", body: { page_size: 1 }, cipher: true },
    { nome: "products/search", path: "/product/202309/products/search", method: "POST", body: { page_size: 1 }, cipher: true },
    { nome: "reviews A", path: "/product/202309/products/reviews", method: "GET", cipher: true },
    { nome: "reviews B", path: "/review/202309/reviews/search", method: "POST", body: { page_size: 1 }, cipher: true },
    { nome: "reviews C", path: "/review/202405/reviews/search", method: "POST", body: { page_size: 1 }, cipher: true },
    { nome: "reviews D", path: "/product/202405/reviews/search", method: "POST", body: { page_size: 1 }, cipher: true },
    { nome: "reviews E", path: "/customer_service/202309/reviews/search", method: "POST", body: { page_size: 1 }, cipher: true },
    { nome: "analytics shop", path: "/analytics/202405/shop/performance", method: "GET", cipher: true },
    { nome: "conversations (chat)", path: "/customer_service/202309/conversations", method: "GET", cipher: true },
  ];

  const resultados = [];
  for (const c of candidatos) {
    try {
      const r = await chamarTikTok(c.path, {
        method: c.method,
        accessToken: acc,
        shopCipher: c.cipher ? cipher : undefined,
        body: c.body,
      });
      resultados.push({
        nome: c.nome,
        path: c.path,
        code: r?.code,
        message: String(r?.message || "").slice(0, 120),
      });
    } catch (e) {
      resultados.push({
        nome: c.nome,
        path: c.path,
        erro: e instanceof Error ? e.message : "erro",
      });
    }
  }

  return NextResponse.json({
    sucesso: true,
    leitura:
      "code 0 = FUNCIONA. code 105005 = existe mas falta escopo. code de 'invalid'/param = existe (so faltou parametro). 'not found'/404 = endpoint nao existe.",
    resultados,
  });
}
