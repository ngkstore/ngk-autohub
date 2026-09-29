import { supabase } from "@/lib/supabase";
import { chamarTikTok } from "@/lib/tiktok/client";
import { lojasTikTokAtivas, type LojaTikTok } from "@/lib/tiktok/lojas";

// Finanças TikTok: lê os extratos diários (statements) e as transações de cada
// extrato pela API financeira e grava em tiktok_extratos / tiktok_transacoes;
// depois a RPC tiktok_aplicar_pedidos soma por pedido e preenche as colunas
// financeiras do pedido (as mesmas que o escrow da Shopee usa), então o
// /financas passa a enxergar o TikTok. Ver supabase/tiktok_financeiro.sql.
//
// Sinais: a TikTok manda taxas NEGATIVAS (cobrança) e positivas em estorno; aqui
// guardamos como COBRANÇA positiva (estorno vira negativo e abate no agregado).

const n = (v: unknown) => { const x = Number(v ?? 0); return Number.isFinite(x) ? x : 0; };
const cobranca = (v: unknown) => -n(v);
const iso = (unix: unknown) => (n(unix) > 0 ? new Date(n(unix) * 1000).toISOString() : null);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const unixDia = (iso: string) => Math.floor(new Date(`${iso}T00:00:00-03:00`).getTime() / 1000);

type Resp = { code?: number; message?: string; data?: Record<string, unknown> };

// GET assinado com retry no rate limit (36009002) e espaçamento entre chamadas.
async function chamar(loja: LojaTikTok, path: string, query: Record<string, string>): Promise<Resp> {
  for (let tent = 0; tent < 3; tent++) {
    const r = (await chamarTikTok(path, {
      method: "GET", accessToken: loja.accessToken, shopCipher: loja.shopCipher, query,
    })) as Resp;
    if (r?.code === 36009002) { await sleep(2500 * (tent + 1)); continue; }
    await sleep(250);
    return r;
  }
  return { code: 36009002, message: "rate limit persistente" };
}

type Extrato = Record<string, unknown>;

// 1) Lista os extratos a partir de `desdeUnix` e faz upsert (sem mexer em
//    processado_em). Devolve os ids cujo pagamento virou PAID depois de já
//    processados (precisam re-aplicar recebido_em nos pedidos).
export async function listarExtratos(loja: LojaTikTok, desdeUnix: number) {
  let token = "";
  let total = 0;
  const reaplicar: string[] = [];
  for (let pag = 0; pag < 60; pag++) {
    const q: Record<string, string> = {
      sort_field: "statement_time", sort_order: "ASC", page_size: "50", statement_time_ge: String(desdeUnix),
    };
    if (token) q.page_token = token;
    const r = await chamar(loja, "/finance/202309/statements", q);
    if (r?.code !== 0) throw new Error(`statements: ${r?.code} ${r?.message}`);
    const sts = (r.data?.statements as Extrato[]) || [];
    if (sts.length === 0) break;

    const ids = sts.map((s) => String(s.id));
    const { data: antes } = await supabase
      .from("tiktok_extratos").select("id, payment_status, processado_em").in("id", ids);
    const mapaAntes = new Map((antes || []).map((a) => [String(a.id), a]));

    const linhas = sts.map((s) => ({
      id: String(s.id),
      loja_id: loja.lojaId,
      statement_time: iso(s.statement_time),
      currency: (s.currency as string) || null,
      revenue: n(s.revenue_amount), fee: n(s.fee_amount), shipping_cost: n(s.shipping_cost_amount),
      adjustment: n(s.adjustment_amount), settlement: n(s.settlement_amount), net_sales: n(s.net_sales_amount),
      payment_id: (s.payment_id as string) || null,
      payment_status: (s.payment_status as string) || null,
      payment_time: iso(s.payment_time),
      atualizado_em: new Date().toISOString(),
    }));
    const { error } = await supabase.from("tiktok_extratos").upsert(linhas, { onConflict: "id" });
    if (error) throw new Error(`upsert extratos: ${error.message}`);
    total += linhas.length;

    for (const l of linhas) {
      const a = mapaAntes.get(l.id);
      if (a && a.processado_em && a.payment_status !== "PAID" && l.payment_status === "PAID") reaplicar.push(l.id);
    }
    token = (r.data?.next_page_token as string) || "";
    if (!token) break;
  }
  return { total, reaplicar };
}

type Tx = Record<string, unknown>;

function mapearTx(t: Tx, loja: LojaTikTok, statementId: string) {
  const bd = (t.fee_tax_breakdown as Record<string, unknown>) || {};
  const fee = (bd.fee as Record<string, unknown>) || {};
  const rev = (t.revenue_breakdown as Record<string, unknown>) || {};
  const ship = (t.shipping_cost_breakdown as Record<string, unknown>) || {};
  const comissao = cobranca(fee.platform_commission_amount) + cobranca(fee.fee_per_item_sold_amount);
  const sfp = cobranca(fee.sfp_service_fee_amount);
  const afiliado = cobranca(fee.affiliate_commission_amount) + cobranca(fee.affiliate_partner_commission_amount);
  const afiliadoAds = cobranca(fee.affiliate_ads_commission_amount) + cobranca(fee.tap_shop_ads_commission);
  const feeTax = cobranca(t.fee_tax_amount);
  return {
    id: String(t.id),
    loja_id: loja.lojaId,
    statement_id: statementId,
    order_id: t.order_id != null ? String(t.order_id) : null,
    tipo: (t.type as string) || "ORDER",
    order_create_time: iso(t.order_create_time),
    revenue: n(t.revenue_amount),
    fee_tax: feeTax,
    shipping_cost: cobranca(t.shipping_cost_amount),
    adjustment: n(t.adjustment_amount),
    settlement: n(t.settlement_amount),
    comissao_plataforma: comissao,
    frete_gratis_taxa: sfp,
    afiliado,
    afiliado_ads: afiliadoAds,
    outras_taxas: Math.round((feeTax - comissao - sfp - afiliado - afiliadoAds) * 100) / 100,
    desconto_vendedor: cobranca(rev.seller_discount_amount) + cobranca(rev.seller_discount_refund_amount),
    frete_pago_cliente: n(ship.customer_paid_shipping_fee_amount),
    frete_real: cobranca(ship.actual_shipping_fee_amount),
    breakdown: { fee_tax_breakdown: t.fee_tax_breakdown, revenue_breakdown: t.revenue_breakdown, shipping_cost_breakdown: t.shipping_cost_breakdown },
  };
}

// 2) Lê todas as transações de um extrato, grava e aplica nos pedidos.
export async function processarExtrato(loja: LojaTikTok, statementId: string) {
  let token = "";
  let pageSize = 100;
  let lidas = 0;
  const orderIds = new Set<string>();
  for (let pag = 0; pag < 80; pag++) {
    const q: Record<string, string> = { sort_field: "order_create_time", sort_order: "DESC", page_size: String(pageSize) };
    if (token) q.page_token = token;
    const r = await chamar(loja, `/finance/202501/statements/${statementId}/statement_transactions`, q);
    if (r?.code !== 0) {
      // page_size fora do permitido: tenta menor uma vez
      if (pageSize === 100 && /page_size|PageSize/i.test(String(r?.message || ""))) { pageSize = 50; continue; }
      throw new Error(`transactions ${statementId}: ${r?.code} ${r?.message}`);
    }
    const txs = (r.data?.transactions as Tx[]) || [];
    if (txs.length > 0) {
      const linhas = txs.map((t) => mapearTx(t, loja, statementId));
      const { error } = await supabase.from("tiktok_transacoes").upsert(linhas, { onConflict: "id" });
      if (error) throw new Error(`upsert transacoes: ${error.message}`);
      lidas += linhas.length;
      for (const l of linhas) if (l.tipo === "ORDER" && l.order_id) orderIds.add(l.order_id);
    }
    token = (r.data?.next_page_token as string) || "";
    if (!token || txs.length === 0) break;
  }
  const pedidos = await aplicarPedidos(loja, [...orderIds]);
  await supabase
    .from("tiktok_extratos")
    .update({ transacoes: lidas, processado_em: new Date().toISOString(), atualizado_em: new Date().toISOString() })
    .eq("id", statementId);
  return { lidas, pedidos };
}

async function aplicarPedidos(loja: LojaTikTok, orderIds: string[]) {
  let total = 0;
  for (let i = 0; i < orderIds.length; i += 400) {
    const { data, error } = await supabase.rpc("tiktok_aplicar_pedidos", {
      p_loja: loja.lojaId, p_order_ids: orderIds.slice(i, i + 400),
    });
    if (error) throw new Error(`aplicar pedidos: ${error.message}`);
    total += Number(data || 0);
  }
  return total;
}

export type ResultadoFinanceiroTikTok = {
  loja: string;
  extratos_listados: number;
  extratos_processados: number;
  transacoes: number;
  pedidos_atualizados: number;
  pendentes_restantes: number;
  reaplicados: number;
  erro?: string;
};

// 3) Rotina do cron/backfill. `desde` (YYYY-MM-DD) força a listagem a partir de
//    uma data; sem `desde`, relista a partir do último extrato − 3 dias (pega
//    extratos novos e mudanças de status de pagamento). Respeita um orçamento
//    de tempo: o que não couber fica pendente pra próxima rodada.
export async function sincronizarFinanceiroTikTok({
  lojaId, desde, budgetMs = 240_000, maxExtratos = 60,
}: { lojaId?: string; desde?: string; budgetMs?: number; maxExtratos?: number } = {}) {
  const inicio = Date.now();
  const lojas = (await lojasTikTokAtivas()).filter((l) => !lojaId || l.lojaId === lojaId);
  const saida: ResultadoFinanceiroTikTok[] = [];
  for (const loja of lojas) {
    const res: ResultadoFinanceiroTikTok = {
      loja: loja.lojaId, extratos_listados: 0, extratos_processados: 0, transacoes: 0,
      pedidos_atualizados: 0, pendentes_restantes: 0, reaplicados: 0,
    };
    try {
      let desdeUnix: number;
      if (desde) desdeUnix = unixDia(desde);
      else {
        const { data: ult } = await supabase
          .from("tiktok_extratos").select("statement_time").eq("loja_id", loja.lojaId)
          .order("statement_time", { ascending: false }).limit(1).maybeSingle();
        desdeUnix = ult?.statement_time
          ? Math.floor(new Date(ult.statement_time as string).getTime() / 1000) - 3 * 86400
          : unixDia("2025-06-01");
      }
      const lst = await listarExtratos(loja, desdeUnix);
      res.extratos_listados = lst.total;

      // pagamentos que viraram PAID depois de processados: re-aplica recebido_em
      for (const id of lst.reaplicar) {
        const { data: tx } = await supabase.from("tiktok_transacoes").select("order_id").eq("statement_id", id).eq("tipo", "ORDER");
        const ids = [...new Set((tx || []).map((t) => String(t.order_id)).filter(Boolean))];
        res.reaplicados += await aplicarPedidos(loja, ids);
      }

      const { data: pend } = await supabase
        .from("tiktok_extratos").select("id").eq("loja_id", loja.lojaId).is("processado_em", null)
        .order("statement_time", { ascending: true }).limit(maxExtratos);
      const fila = (pend || []).map((p) => String(p.id));
      for (const id of fila) {
        if (Date.now() - inicio > budgetMs) break;
        const r = await processarExtrato(loja, id);
        res.extratos_processados++;
        res.transacoes += r.lidas;
        res.pedidos_atualizados += r.pedidos;
      }
      const { count } = await supabase
        .from("tiktok_extratos").select("id", { count: "exact", head: true })
        .eq("loja_id", loja.lojaId).is("processado_em", null);
      res.pendentes_restantes = count || 0;
    } catch (e) {
      res.erro = e instanceof Error ? e.message : String(e);
    }
    saida.push(res);
  }
  return saida;
}
