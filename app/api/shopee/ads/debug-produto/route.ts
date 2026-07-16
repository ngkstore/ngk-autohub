import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BASE_URL =
  process.env.SHOPEE_API_BASE_URL || "https://partner.shopeemobile.com";

function assinar(
  partnerId: string,
  path: string,
  ts: number,
  accessToken: string,
  shopId: string,
  partnerKey: string
) {
  return crypto
    .createHmac("sha256", partnerKey)
    .update(`${partnerId}${path}${ts}${accessToken}${shopId}`)
    .digest("hex");
}

function ddmmyyyy(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()}`;
}

// SONDAGEM (só leitura): a API de Ads entrega dados POR PRODUTO/campanha?
// E vem "add to cart"? É o que decide se o Raio-X do Anúncio roda 100%
// automático (sem planilha). ?loja=<id> opcional.
export async function GET(request: NextRequest) {
  try {
    const partnerId = process.env.SHOPEE_PARTNER_ID;
    const partnerKey = process.env.SHOPEE_PARTNER_KEY;
    if (!partnerId || !partnerKey) {
      return NextResponse.json({ sucesso: false, erro: "Credenciais ausentes." }, { status: 500 });
    }

    const lojaId = request.nextUrl.searchParams.get("loja") || "";
    const q = supabase
      .from("marketplace_tokens")
      .select("access_token, shop_id")
      .eq("marketplace", "shopee")
      .eq("status", "ativo");
    const { data: token } = lojaId
      ? await q.eq("loja_id", lojaId).limit(1).maybeSingle()
      : await q.limit(1).maybeSingle();

    if (!token?.access_token || !token?.shop_id) {
      return NextResponse.json({ sucesso: false, erro: "Token ativo não encontrado." }, { status: 400 });
    }

    const shopId = String(token.shop_id);
    const accessToken = token.access_token;

    async function chamar(path: string, params: Record<string, string> = {}) {
      const ts = Math.floor(Date.now() / 1000);
      const sign = assinar(String(partnerId), path, ts, accessToken, shopId, String(partnerKey));
      const url = new URL(`${BASE_URL}${path}`);
      url.searchParams.set("partner_id", String(partnerId));
      url.searchParams.set("timestamp", String(ts));
      url.searchParams.set("access_token", accessToken);
      url.searchParams.set("shop_id", shopId);
      url.searchParams.set("sign", sign);
      for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
      const r = await fetch(url.toString(), { method: "GET", cache: "no-store" });
      return r.json();
    }

    // Ontem (dia fechado).
    const ontem = new Date();
    ontem.setDate(ontem.getDate() - 1);
    const dia = ddmmyyyy(ontem);

    // 1) Lista TODAS as campanhas (paginando) p/ achar as GMV Max ativas.
    type Camp = { ad_type?: string; campaign_id?: number };
    const todas: Camp[] = [];
    for (let pagina = 0; pagina < 10; pagina++) {
      const r = await chamar("/api/v2/ads/get_product_level_campaign_id_list", {
        offset: String(pagina * 100),
        limit: "100",
      });
      const bloco: Camp[] = r?.response?.campaign_list || [];
      todas.push(...bloco);
      if (!r?.response?.has_next_page || bloco.length === 0) break;
    }

    const porTipo: Record<string, number> = {};
    todas.forEach((c) => {
      const t = c.ad_type || "?";
      porTipo[t] = (porTipo[t] || 0) + 1;
    });

    // Prioriza campanhas que NÃO são "manual" (as GMV Max ativas).
    const naoManual = todas.filter((c) => c.ad_type && c.ad_type !== "manual");
    const alvo = (naoManual.length > 0 ? naoManual : todas).slice(0, 5);
    const ids = alvo.map((c) => c.campaign_id).filter(Boolean);

    const lista = { response: { total: todas.length, por_tipo: porTipo }, error: null };
    const resp = lista.response;

    // 2) Performance diária dessas campanhas.
    let performance = null;
    if (ids.length > 0) {
      performance = await chamar("/api/v2/ads/get_product_campaign_daily_performance", {
        campaign_id_list: ids.join(","),
        start_date: dia,
        end_date: dia,
      });
    }

    // 3) Config da campanha: traz item_id + palavras-chave + lance.
    let config = null;
    if (ids.length > 0) {
      config = await chamar("/api/v2/ads/get_product_level_campaign_setting_info", {
        campaign_id_list: String(ids[0]),
        info_type_list: "1,2,3,4",
      });
    }

    // 4) GMS = provavelmente o GMV Max (as campanhas ATIVAS). É aqui que
    //    deveríamos achar a performance POR ITEM das campanhas de verdade.
    const gmsCampanha = await chamar("/api/v2/ads/get_gms_campaign_performance", {
      start_date: dia,
      end_date: dia,
    });
    const gmsItem = await chamar("/api/v2/ads/get_gms_item_performance", {
      start_date: dia,
      end_date: dia,
    });

    return NextResponse.json({
      sucesso: true,
      shop_id: shopId,
      dia,
      campanhas: {
        total: resp.total,
        por_tipo: resp.por_tipo, // manual vs gmv max (auto)
        ids_testados: ids,
      },
      performance_por_campanha: {
        resposta: performance?.response ?? null,
        erro: performance?.error ? `${performance.error} | ${performance.message}` : null,
      },
      config_campanha: {
        resposta: config?.response ?? null,
        erro: config?.error ? `${config.error} | ${config.message}` : null,
      },
      // A aposta: GMS = GMV Max (as campanhas ativas de verdade).
      gms_campanha: {
        resposta: gmsCampanha?.response ?? null,
        erro: gmsCampanha?.error ? `${gmsCampanha.error} | ${gmsCampanha.message}` : null,
      },
      gms_item: {
        resposta: gmsItem?.response ?? null,
        erro: gmsItem?.error ? `${gmsItem.error} | ${gmsItem.message}` : null,
      },
      leitura:
        "Se 'gms_item' vier com dados por item_id (impressão/clique/gasto/ROAS), " +
        "o Raio-X roda 100% por API, sem planilha. Se der erro de parâmetro, o erro diz o que falta.",
    });
  } catch (error) {
    return NextResponse.json(
      { sucesso: false, erro: error instanceof Error ? error.message : "Erro." },
      { status: 500 }
    );
  }
}
