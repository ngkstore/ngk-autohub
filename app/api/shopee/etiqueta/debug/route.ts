import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { supabase } from "@/lib/supabase";
import { escopoDoUsuario, podeVerLoja } from "@/lib/conta";

export const dynamic = "force-dynamic";

// SONDAGEM: dados da ETIQUETA (get_shipping_document_data_info) — é o que vai
// IMPRESSO na etiqueta/waybill. Hipótese: mesmo com o endereço mascarado no
// get_order_detail, os dados da etiqueta podem trazer cidade/estado (é assim
// que tools tipo Upseller pegam). Não imprime nada — só lê.
//
// Uso (admin): /api/shopee/etiqueta/debug?loja=<id>&pedido=<order_sn>
const BASE = process.env.SHOPEE_API_BASE_URL || "https://partner.shopeemobile.com";

function assinar(pid: string, path: string, ts: number, token: string, shopId: string, key: string) {
  return crypto.createHmac("sha256", key).update(`${pid}${path}${ts}${token}${shopId}`).digest("hex");
}

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

  // Pedido pra sondar: prioriza um já com etiqueta gerada (PROCESSED/SHIPPED).
  async function acharPedido(status?: string[]) {
    let q = supabase
      .from("pedidos")
      .select("pedido_externo_id")
      .eq("marketplace", "shopee")
      .not("pedido_externo_id", "like", "SH-%")
      .not("data_pedido", "is", null)
      .order("data_pedido", { ascending: false })
      .limit(1);
    if (token?.loja_id) q = q.eq("loja_id", token.loja_id);
    if (status) q = q.in("status", status);
    const { data } = await q.maybeSingle();
    return data?.pedido_externo_id ?? null;
  }
  let orderSn = request.nextUrl.searchParams.get("pedido") || null;
  if (!orderSn) {
    orderSn =
      (await acharPedido(["PROCESSED", "SHIPPED", "TO_CONFIRM_RECEIVE", "COMPLETED"])) ||
      (await acharPedido());
  }
  if (!orderSn) {
    return NextResponse.json({ sucesso: false, erro: "Nenhum pedido real p/ sondar. Passe ?pedido=<order_sn>." }, { status: 404 });
  }

  async function postar(path: string, body: unknown) {
    const ts = Math.floor(Date.now() / 1000);
    const sign = assinar(String(partnerId), path, ts, accessToken, shopId, String(partnerKey));
    const url =
      `${BASE}${path}?partner_id=${partnerId}&timestamp=${ts}` +
      `&access_token=${encodeURIComponent(accessToken)}&shop_id=${shopId}&sign=${sign}`;
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    return r.json();
  }

  try {
    // Tenta alguns tipos de documento (o erro dirá qual é válido p/ a loja).
    const tipos = ["THERMAL_AIR_WAYBILL", "NORMAL_AIR_WAYBILL"];
    const resultados: Record<string, unknown> = {};
    let acheiEndereco: unknown = null;

    for (const tipo of tipos) {
      const data = await postar("/api/v2/logistics/get_shipping_document_data_info", {
        shipping_document_type: tipo,
        order_list: [{ order_sn: orderSn }],
      });
      resultados[tipo] = data;
      // procura recipient_address em qualquer lugar da resposta
      const info = data?.response?.data_info_list?.[0] || data?.response || null;
      const addr = info?.recipient_address || info?.buyer_address || null;
      if (addr && !acheiEndereco) acheiEndereco = addr;
      if (!data?.error) break; // deu certo, para
    }

    return NextResponse.json({
      sucesso: true,
      loja_id: token.loja_id,
      pedido: orderSn,
      endereco_na_etiqueta: acheiEndereco,
      dica:
        "Se 'endereco_na_etiqueta' vier com cidade/estado = REGIÃO POR API (sem coletor). " +
        "Se der 'please create shipping document first' = a etiqueta precisa ser gerada antes (fluxo async). " +
        "Se der 'no permission' = falta escopo de Logística. Se vier mascarado = só via coletor.",
      respostas: resultados,
    });
  } catch (error) {
    return NextResponse.json(
      { sucesso: false, erro: error instanceof Error ? error.message : "Erro ao sondar a etiqueta." },
      { status: 500 }
    );
  }
}
