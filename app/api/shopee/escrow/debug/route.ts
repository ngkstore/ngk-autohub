import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { supabase } from "@/lib/supabase";
import { escopoDoUsuario, podeVerLoja } from "@/lib/conta";

export const dynamic = "force-dynamic";

// SONDAGEM: get_escrow_detail — dump COMPLETO do order_income de um pedido.
// Objetivo: achar o campo da comissão de AFILIADO (e outras taxas que a gente
// talvez não esteja capturando hoje) pra incluir no DRE e limpar "divergências"
// que na verdade são cobrança de afiliado.
//
// Uso (admin): /api/shopee/escrow/debug?pedido=<order_sn>&loja=<id>
const BASE = process.env.SHOPEE_API_BASE_URL || "https://partner.shopeemobile.com";

export async function GET(request: NextRequest) {
  const escopo = await escopoDoUsuario();
  if (!escopo.admin) {
    return NextResponse.json({ sucesso: false, erro: "Só o administrador pode sondar." }, { status: 403 });
  }
  const partnerId = process.env.SHOPEE_PARTNER_ID;
  const partnerKey = process.env.SHOPEE_PARTNER_KEY;
  if (!partnerId || !partnerKey) {
    return NextResponse.json({ sucesso: false, erro: "Credenciais Shopee ausentes." }, { status: 500 });
  }

  const lojaParam = request.nextUrl.searchParams.get("loja");
  if (lojaParam && !podeVerLoja(escopo, lojaParam)) {
    return NextResponse.json({ sucesso: false, erro: "Loja fora da sua conta." }, { status: 403 });
  }

  let tq = supabase
    .from("marketplace_tokens")
    .select("access_token, shop_id, loja_id")
    .eq("marketplace", "shopee")
    .eq("status", "ativo");
  if (lojaParam) tq = tq.eq("loja_id", lojaParam);
  const { data: token } = await tq.limit(1).maybeSingle();
  if (!token?.access_token || !token?.shop_id) {
    return NextResponse.json({ sucesso: false, erro: "Loja Shopee sem token ativo." }, { status: 400 });
  }
  const accessToken = token.access_token as string;
  const shopId = String(token.shop_id);

  // Pedido: ?pedido, ou um efetivado recente (mais chance de ter afiliado/escrow).
  let orderSn = request.nextUrl.searchParams.get("pedido") || null;
  if (!orderSn) {
    let q = supabase
      .from("pedidos")
      .select("pedido_externo_id")
      .eq("marketplace", "shopee")
      .eq("pedido_efetivado", true)
      .not("pedido_externo_id", "like", "SH-%")
      .not("escrow_atualizado_em", "is", null)
      .order("data_pedido", { ascending: false })
      .limit(1);
    if (token.loja_id) q = q.eq("loja_id", token.loja_id);
    const { data } = await q.maybeSingle();
    orderSn = data?.pedido_externo_id ?? null;
  }
  if (!orderSn) {
    return NextResponse.json({ sucesso: false, erro: "Nenhum pedido com escrow p/ sondar. Passe ?pedido=<order_sn>." }, { status: 404 });
  }

  const path = "/api/v2/payment/get_escrow_detail";
  const ts = Math.floor(Date.now() / 1000);
  const sign = crypto
    .createHmac("sha256", partnerKey)
    .update(`${partnerId}${path}${ts}${accessToken}${shopId}`)
    .digest("hex");
  const url =
    `${BASE}${path}?partner_id=${partnerId}&timestamp=${ts}` +
    `&access_token=${encodeURIComponent(accessToken)}&shop_id=${shopId}&sign=${sign}` +
    `&order_sn=${orderSn}`;

  try {
    const r = await fetch(url, { method: "GET", cache: "no-store" });
    const data = await r.json();
    const income = data?.response?.order_income || null;

    // Destaca qualquer campo cujo nome cite "affiliate"/"afiliad"/"ams"/"campaign".
    const camposAfiliado: Record<string, unknown> = {};
    if (income) {
      for (const [k, v] of Object.entries(income)) {
        const kl = k.toLowerCase();
        if (kl.includes("affiliate") || kl.includes("afili") || kl.includes("ams") || kl.includes("campaign")) {
          camposAfiliado[k] = v;
        }
      }
    }

    return NextResponse.json({
      sucesso: !data?.error,
      pedido: orderSn,
      erro_shopee: data?.error || null,
      campos_afiliado_detectados: camposAfiliado,
      // order_income COMPLETO — pra eu ver todos os campos de taxa/custo.
      order_income: income,
      buyer_payment_info: data?.response?.buyer_payment_info || null,
    });
  } catch (error) {
    return NextResponse.json(
      { sucesso: false, erro: error instanceof Error ? error.message : "Erro ao sondar o escrow." },
      { status: 500 }
    );
  }
}
