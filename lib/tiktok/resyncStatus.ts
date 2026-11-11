import { supabase } from "@/lib/supabase";
import { chamarTikTok } from "@/lib/tiktok/client";
import { lojasTikTokAtivas, type LojaTikTok } from "@/lib/tiktok/lojas";

// Ressincroniza o STATUS dos pedidos TikTok em aberto (como o resync-status da Shopee).
// Diagnóstico de 12/11/2026: 2.481 pedidos "AWAITING_COLLECTION" e 738 "AWAITING_SHIPMENT"
// no banco; na API, os com janela de coleta de outubro estavam DELIVERED. O sync normal lê
// por create_time e não revisita pedidos antigos. Aqui: GET /order/202309/orders?ids= (até
// 50 por chamada), os mais antigos primeiro, atualizando status/dados_pedido.
const ABERTOS = ["UNPAID", "ON_HOLD", "AWAITING_SHIPMENT", "PARTIALLY_SHIPPING", "AWAITING_COLLECTION", "IN_TRANSIT"];
const NAO_PAGO = new Set(["UNPAID", "ON_HOLD", "CANCELLED"]);
const FATURAVEL = new Set(["AWAITING_SHIPMENT", "PARTIALLY_SHIPPING", "AWAITING_COLLECTION", "IN_TRANSIT", "DELIVERED", "COMPLETED"]);
type J = Record<string, unknown>;

export async function resyncStatusTikTokLoja(loja: LojaTikTok, limite = 500, orcamentoMs = 200_000): Promise<{ loja_id: string; lidos: number; mudaram: number; erro?: string; por_status: Record<string, number> }> {
  const inicio = Date.now();
  const r = { loja_id: loja.lojaId, lidos: 0, mudaram: 0, por_status: {} as Record<string, number> };
  const { data: pendentes } = await supabase
    .from("pedidos")
    .select("id, pedido_externo_id, status")
    .eq("loja_id", loja.lojaId)
    .eq("marketplace", "tiktok_shop")
    .in("status", ABERTOS)
    .order("atualizado_em", { ascending: true, nullsFirst: true })
    .limit(limite);
  const lista = pendentes || [];
  for (let i = 0; i < lista.length; i += 50) {
    if (Date.now() - inicio > orcamentoMs) break;
    const bloco = lista.slice(i, i + 50);
    let resp: J;
    try {
      resp = await chamarTikTok("/order/202309/orders", { accessToken: loja.accessToken, shopCipher: loja.shopCipher, query: { ids: bloco.map((p) => p.pedido_externo_id).join(",") } });
    } catch (e) {
      return { ...r, erro: e instanceof Error ? e.message : String(e) };
    }
    if (resp.code === 36009002) {
      await new Promise((ok) => setTimeout(ok, 2500));
      i -= 50;
      continue;
    }
    if (resp.code !== 0) return { ...r, erro: `${resp.code} ${resp.message}` };
    const porId = new Map(((resp.data as J)?.orders as J[] || []).map((o) => [String(o.id), o]));
    for (const p of bloco) {
      const o = porId.get(p.pedido_externo_id);
      if (!o) continue;
      r.lidos++;
      const status = String(o.status || "");
      r.por_status[status] = (r.por_status[status] || 0) + 1;
      if (status && status !== p.status) {
        await supabase.from("pedidos").update({ status, pedido_efetivado: !NAO_PAGO.has(status), entra_faturamento: FATURAVEL.has(status), dados_pedido: o, atualizado_em: new Date().toISOString() }).eq("id", p.id);
        r.mudaram++;
      } else {
        await supabase.from("pedidos").update({ dados_pedido: o, atualizado_em: new Date().toISOString() }).eq("id", p.id);
      }
    }
  }
  return r;
}

export async function resyncStatusTikTok(opts: { lojaId?: string; limite?: number; orcamentoMs?: number } = {}) {
  const inicio = Date.now();
  const saida = [];
  for (const l of (await lojasTikTokAtivas()).filter((l) => !opts.lojaId || l.lojaId === opts.lojaId)) {
    const sobra = (opts.orcamentoMs ?? 240_000) - (Date.now() - inicio);
    if (sobra < 10_000) break;
    saida.push(await resyncStatusTikTokLoja(l, opts.limite ?? 500, sobra));
  }
  return saida;
}
