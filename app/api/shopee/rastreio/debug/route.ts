import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { supabase } from "@/lib/supabase";
import { escopoDoUsuario, podeVerLoja } from "@/lib/conta";

export const dynamic = "force-dynamic";

// SONDAGEM: rastreio (get_tracking_info) + endereço do pedido (get_order_detail).
// Objetivo: confirmar, para o futuro fluxo de caixa/previsão por região:
//   (1) se dá pra pegar data de ENVIO e ENTREGA + histórico de logística;
//   (2) qual a GRANULARIDADE do endereço (estado / cidade / CEP / mascarado).
//
// Uso (admin): /api/shopee/rastreio/debug?loja=<id>&pedido=<order_sn>
//   - sem ?pedido: pega um pedido Shopee recente e real da loja.
const BASE = process.env.SHOPEE_API_BASE_URL || "https://partner.shopeemobile.com";

function assinar(pid: string, path: string, ts: number, token: string, shopId: string, key: string) {
  return crypto
    .createHmac("sha256", key)
    .update(`${pid}${path}${ts}${token}${shopId}`)
    .digest("hex");
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

  // Token da loja (ou primeiro ativo).
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

  // Qual pedido sondar? ?pedido, ou um recente/real da loja.
  let orderSn = request.nextUrl.searchParams.get("pedido") || null;
  if (!orderSn) {
    let pq = supabase
      .from("pedidos")
      .select("pedido_externo_id, loja_id")
      .eq("marketplace", "shopee")
      .not("pedido_externo_id", "like", "SH-%")
      .not("data_pedido", "is", null)
      .order("data_pedido", { ascending: false })
      .limit(1);
    if (token.loja_id) pq = pq.eq("loja_id", token.loja_id);
    const { data: ped } = await pq.maybeSingle();
    orderSn = ped?.pedido_externo_id ?? null;
  }
  if (!orderSn) {
    return NextResponse.json({ sucesso: false, erro: "Nenhum pedido real encontrado p/ sondar. Passe ?pedido=<order_sn>." }, { status: 404 });
  }

  async function chamar(path: string, extra: string) {
    const ts = Math.floor(Date.now() / 1000);
    const sign = assinar(String(partnerId), path, ts, accessToken, shopId, String(partnerKey));
    const url =
      `${BASE}${path}?partner_id=${partnerId}&timestamp=${ts}` +
      `&access_token=${encodeURIComponent(accessToken)}&shop_id=${shopId}&sign=${sign}${extra}`;
    const r = await fetch(url, { method: "GET", cache: "no-store" });
    return r.json();
  }

  try {
    // 1) Detalhe do pedido — pedindo o endereço e as datas.
    const campos = "recipient_address,pay_time,ship_by_date,order_status,update_time";
    const detalhe = await chamar(
      "/api/v2/order/get_order_detail",
      `&order_sn_list=${orderSn}&response_optional_fields=${campos}`
    );
    const pedido = detalhe?.response?.order_list?.[0] || null;
    const endereco = pedido?.recipient_address || null;

    // 2) Rastreio — eventos de logística com data.
    const rastreio = await chamar(
      "/api/v2/logistics/get_tracking_info",
      `&order_sn=${orderSn}`
    );

    return NextResponse.json({
      sucesso: true,
      loja_id: token.loja_id,
      pedido: orderSn,
      // --- granularidade do endereço (o que decide cidade/CEP/estado) ---
      endereco_disponivel: endereco
        ? {
            estado: endereco.state ?? null,
            cidade: endereco.city ?? null,
            bairro: endereco.district ?? null,
            cep: endereco.zipcode ?? null,
            regiao: endereco.region ?? null,
            nome_mascarado: endereco.name ?? null,
            full_address_mascarado: endereco.full_address ?? null,
          }
        : null,
      datas_pedido: pedido
        ? {
            order_status: pedido.order_status ?? null,
            pay_time: pedido.pay_time ?? null,
            ship_by_date: pedido.ship_by_date ?? null,
            update_time: pedido.update_time ?? null,
          }
        : null,
      // --- rastreio (envio/entrega/eventos) ---
      logistics_status: rastreio?.response?.logistics_status ?? null,
      eventos_rastreio: rastreio?.response?.tracking_info ?? null,
      dica:
        "endereco: veja se vem cidade/cep (granularidade). " +
        "eventos_rastreio: cada item traz update_time + status; o 'entregue' dá a data de entrega. " +
        "erro 'no permission' em algum = falta escopo de Logística no app.",
      erros: {
        detalhe: detalhe?.error || null,
        rastreio: rastreio?.error || null,
      },
      bruto: { detalhe, rastreio },
    });
  } catch (error) {
    return NextResponse.json(
      { sucesso: false, erro: error instanceof Error ? error.message : "Erro ao sondar rastreio." },
      { status: 500 }
    );
  }
}
