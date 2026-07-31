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
    const txt = await r.text();
    try {
      return JSON.parse(txt);
    } catch {
      // Resposta não-JSON (erro de gateway/binário): guarda o texto cru.
      return { _nao_json: true, http_status: r.status, corpo: txt.slice(0, 400) };
    }
  }

  try {
    // TODAS as chamadas abaixo são SOMENTE LEITURA (não cria/altera envio).
    // Tenta vários formatos + endpoints numa rodada só pra achar o que funciona.
    const tentativas: { nome: string; path: string; body: unknown }[] = [
      { nome: "data_info__order_list", path: "/api/v2/logistics/get_shipping_document_data_info", body: { order_list: [{ order_sn: orderSn }] } },
      { nome: "data_info__order_sn", path: "/api/v2/logistics/get_shipping_document_data_info", body: { order_sn: orderSn } },
      { nome: "data_info__order_list_tipo", path: "/api/v2/logistics/get_shipping_document_data_info", body: { order_list: [{ order_sn: orderSn }], shipping_document_type: "NORMAL_AIR_WAYBILL" } },
      { nome: "shipping_parameter", path: "/api/v2/logistics/get_shipping_parameter", body: { order_sn: orderSn } },
      { nome: "tracking_number", path: "/api/v2/logistics/get_tracking_number", body: { order_sn: orderSn } },
    ];

    // Procura recursivamente por qualquer coisa que pareça endereço/cidade/estado.
    function acharEndereco(obj: unknown): unknown {
      if (!obj || typeof obj !== "object") return null;
      const o = obj as Record<string, unknown>;
      for (const chave of ["recipient_address", "buyer_address", "to_address", "address"]) {
        if (o[chave] && typeof o[chave] === "object") return o[chave];
      }
      if ("state" in o || "city" in o || "district" in o || "zipcode" in o) return o;
      for (const v of Object.values(o)) {
        const achou = acharEndereco(v);
        if (achou) return achou;
      }
      return null;
    }

    const respostas: Record<string, unknown> = {};
    let endereco: unknown = null;
    let ondeAchou: string | null = null;

    for (const t of tentativas) {
      const data = await postar(t.path, t.body);
      respostas[t.nome] = data;
      if (!endereco && !data?.error) {
        const addr = acharEndereco(data?.response);
        if (addr) {
          endereco = addr;
          ondeAchou = t.nome;
        }
      }
    }

    return NextResponse.json({
      sucesso: true,
      loja_id: token.loja_id,
      pedido: orderSn,
      endereco_encontrado: endereco,
      onde_achou: ondeAchou,
      dica:
        "endereco_encontrado com cidade/estado = REGIÃO (e nome) POR API. " +
        "'no permission' = falta escopo de Logística. " +
        "'create document first' = precisa gerar a etiqueta antes (mas o Upseller já gerou; se aparecer, revemos). " +
        "Tudo mascarado (****) = só via coletor.",
      respostas,
    });
  } catch (error) {
    return NextResponse.json(
      { sucesso: false, erro: error instanceof Error ? error.message : "Erro ao sondar a etiqueta." },
      { status: 500 }
    );
  }
}
