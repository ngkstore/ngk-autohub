import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { supabase } from "@/lib/supabase";
import { escopoDoUsuario, podeVerLoja } from "@/lib/conta";

export const dynamic = "force-dynamic";

// SONDAGEM: extrato da carteira Shopee (get_wallet_transaction_list).
// Objetivo: confirmar se o app tem acesso (escopo de Finanças) e ver o formato
// real do payload — principalmente se cada transação traz a referência do
// pedido (order_sn) para casar carteira x pedido 1-a-1.
//
// Uso (admin, logado): /api/shopee/carteira/debug?loja=<id>&dias=15
//   - sem ?loja: usa a primeira loja Shopee com token ativo.
//   - dias: janela de create_time (padrão 15).
export async function GET(request: NextRequest) {
  const escopo = await escopoDoUsuario();
  if (!escopo.admin) {
    return NextResponse.json(
      { sucesso: false, erro: "Só o administrador pode sondar." },
      { status: 403 }
    );
  }

  const partnerId = process.env.SHOPEE_PARTNER_ID;
  const partnerKey = process.env.SHOPEE_PARTNER_KEY;
  const baseUrl =
    process.env.SHOPEE_API_BASE_URL || "https://partner.shopeemobile.com";
  if (!partnerId || !partnerKey) {
    return NextResponse.json(
      { sucesso: false, erro: "Credenciais Shopee ausentes." },
      { status: 500 }
    );
  }

  const lojaParam = request.nextUrl.searchParams.get("loja");
  if (lojaParam && !podeVerLoja(escopo, lojaParam)) {
    return NextResponse.json(
      { sucesso: false, erro: "Loja fora da sua conta." },
      { status: 403 }
    );
  }

  // Token da loja (ou o primeiro ativo, se não informar ?loja).
  let tokenQuery = supabase
    .from("marketplace_tokens")
    .select("access_token, shop_id, loja_id")
    .eq("marketplace", "shopee")
    .eq("status", "ativo");
  if (lojaParam) tokenQuery = tokenQuery.eq("loja_id", lojaParam);
  const { data: token } = await tokenQuery.limit(1).maybeSingle();

  if (!token?.access_token || !token?.shop_id) {
    return NextResponse.json(
      { sucesso: false, erro: "Loja Shopee sem token ativo." },
      { status: 400 }
    );
  }

  const accessToken = token.access_token as string;
  const shopId = String(token.shop_id);

  const dias = Number(request.nextUrl.searchParams.get("dias")) || 15;
  const agora = Math.floor(Date.now() / 1000);
  const desde = agora - dias * 24 * 60 * 60;

  const path = "/api/v2/payment/get_wallet_transaction_list";
  const timestamp = Math.floor(Date.now() / 1000);
  const sign = crypto
    .createHmac("sha256", partnerKey)
    .update(`${partnerId}${path}${timestamp}${accessToken}${shopId}`)
    .digest("hex");

  const url =
    `${baseUrl}${path}` +
    `?partner_id=${partnerId}` +
    `&timestamp=${timestamp}` +
    `&access_token=${encodeURIComponent(accessToken)}` +
    `&shop_id=${shopId}` +
    `&sign=${sign}` +
    `&page_no=1&page_size=20` +
    `&create_time_from=${desde}&create_time_to=${agora}`;

  try {
    const resp = await fetch(url, { method: "GET", cache: "no-store" });
    const data = await resp.json();

    // Amostra: primeiras transações, pra ver os campos (e se tem order_sn).
    const lista =
      data?.response?.transaction_list ||
      data?.response?.wallet_transaction_list ||
      data?.response ||
      null;

    return NextResponse.json({
      sucesso: !data?.error,
      loja_id: token.loja_id,
      shop_id: shopId,
      janela_dias: dias,
      http_status: resp.status,
      erro_shopee: data?.error || null,
      mensagem_shopee: data?.message || null,
      // Dica de leitura:
      dica:
        "erro vazio + transaction_list preenchida = TEMOS ACESSO. " +
        "Se aparecer 'no permission'/'invalid scope' = falta o escopo de Finanças no app parceiro. " +
        "Veja se cada item traz 'order_sn' (pra casar carteira x pedido).",
      amostra: Array.isArray(lista) ? lista.slice(0, 5) : lista,
      bruto: data,
    });
  } catch (error) {
    return NextResponse.json(
      {
        sucesso: false,
        erro:
          error instanceof Error ? error.message : "Erro ao sondar a carteira.",
      },
      { status: 500 }
    );
  }
}
