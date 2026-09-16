import { NextRequest, NextResponse } from "next/server";
import { escopoDoUsuario } from "@/lib/conta";
import { obterToken, chamar } from "@/lib/shopee/adsColetor";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// SONDAGEM do módulo AMS (Affiliate Marketing Solution = Programa de Afiliados
// do vendedor). Só leitura: lista permitida de GETs. Serve pra (1) checar se a
// permissão do módulo está habilitada e (2) ver o formato cru de cada endpoint
// antes de montar o coletor do Gestor de Afiliados.
//
// Uso (admin ou Bearer CRON_SECRET):
//   /api/shopee/ams/sondar?loja=<id>                  -> pacote básico
//   /api/shopee/ams/sondar?loja=<id>&ep=<endpoint>&q=<query extra sem o & inicial>
const PERMITIDOS = new Set([
  "get_performance_data_update_time", "get_shop_suggested_rate", "get_auto_add_new_product_toggle_status",
  "get_shop_performance", "get_product_performance", "get_affiliate_performance", "get_content_performance",
  "get_conversion_report", "get_campaign_key_metrics_performance",
  "get_open_campaign_added_product", "get_open_campaign_not_added_product", "get_open_campaign_performance",
  "get_targeted_campaign_list", "get_targeted_campaign_performance", "get_targeted_campaign_settings",
  "get_targeted_campaign_addable_product_list",
  "get_managed_affiliate_list", "get_recommended_affiliate_list", "query_affiliate_list",
  "batch_get_products_suggested_rate", "get_optimization_suggestion_product",
  "get_validation_list", "get_validation_report",
]);

const ymd = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, "");

export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  const viaCron = !!process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`;
  if (!viaCron) {
    const escopo = await escopoDoUsuario();
    if (!escopo.admin) return NextResponse.json({ sucesso: false, erro: "Só o administrador pode sondar." }, { status: 403 });
  }
  const sp = request.nextUrl.searchParams;
  const loja = sp.get("loja") || "";
  const tok = await obterToken(loja);
  if (!tok) return NextResponse.json({ sucesso: false, erro: "loja sem token ativo" });

  const ep = sp.get("ep");
  if (ep) {
    if (!PERMITIDOS.has(ep)) return NextResponse.json({ sucesso: false, erro: "endpoint fora da lista permitida (só leitura)" }, { status: 400 });
    const q = sp.get("q") || "";
    const r = await chamar(`/api/v2/ams/${ep}`, tok, q ? `&${q}` : "");
    return NextResponse.json({ sucesso: true, loja, ep, q, resposta: r });
  }

  // Pacote básico: data mais recente disponível + taxa sugerida + auto-add + performance da loja (30d).
  const upd = await chamar("/api/v2/ams/get_performance_data_update_time", tok, "&marker_type=AmsMarker");
  const latest = String((upd.response as Record<string, unknown> | undefined)?.latest_data_date || "");
  const fim = /^\d{8}$/.test(latest) ? latest : ymd(new Date(Date.now() - 864e5));
  const fimD = new Date(`${fim.slice(0, 4)}-${fim.slice(4, 6)}-${fim.slice(6, 8)}T12:00:00Z`);
  const ini = ymd(new Date(fimD.getTime() - 29 * 864e5));
  const rate = await chamar("/api/v2/ams/get_shop_suggested_rate", tok);
  const toggle = await chamar("/api/v2/ams/get_auto_add_new_product_toggle_status", tok);
  const perf = await chamar(
    "/api/v2/ams/get_shop_performance", tok,
    `&period_type=Last30d&start_date=${ini}&end_date=${fim}&order_type=ConfirmedOrder&channel=AllChannel`
  );
  return NextResponse.json({
    sucesso: true, loja, janela: { ini, fim },
    get_performance_data_update_time: upd,
    get_shop_suggested_rate: rate,
    get_auto_add_new_product_toggle_status: toggle,
    get_shop_performance: perf,
  });
}
