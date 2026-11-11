import { supabase } from "@/lib/supabase";
import { chamarAms, obterTokenAms } from "@/lib/shopee/ams";

// E3 — Shopee AMS get_conversion_report → afiliados_conversao (comissão por pedido e item,
// reembolso e canal). PONTO ABERTO (11/11/2026): o endpoint respondeu "at least one time
// range pair required" para purchase_time_from/to, order_create_time_from/to,
// purchase_time_start/end, complete_time_from/to e start_date/end_date (unix e YYYYMMDD);
// a doc em open.shopee.com não é acessível daqui. Os nomes ficam configuráveis na chave
// `ams_conversion_params` de `configuracoes` (JSON: {"de":"...","ate":"...","formato":"unix|ymd"}).
// Gabriel pode conferir os nomes no console da Open Platform (API Test Tool) e salvar a chave.
type J = Record<string, unknown>;
const n = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v) || 0);
const str = (v: unknown) => (v === null || v === undefined ? null : String(v));

async function nomesParametros(): Promise<{ de: string; ate: string; formato: "unix" | "ymd" }> {
  const { data } = await supabase.from("configuracoes").select("valor").eq("chave", "ams_conversion_params").maybeSingle();
  try {
    const j = JSON.parse(data?.valor || "{}");
    if (j.de && j.ate) return { de: j.de, ate: j.ate, formato: j.formato === "ymd" ? "ymd" : "unix" };
  } catch {
    /* padrão */
  }
  return { de: "purchase_time_from", ate: "purchase_time_to", formato: "unix" };
}

export function mapearConversao(c: J, lojaId: string) {
  const itens = Array.isArray(c.item_list) ? (c.item_list as J[]) : Array.isArray(c.items) ? (c.items as J[]) : [{}];
  return itens.map((it) => ({
    loja_id: lojaId,
    order_sn: String(c.order_sn ?? c.order_id ?? ""),
    item_id: str(it.item_id ?? c.item_id) ?? "",
    affiliate_id: str(c.affiliate_id),
    affiliate_username: str(c.affiliate_username ?? c.affiliate_name),
    canal: str(c.channel ?? c.conversion_channel ?? it.channel),
    comissao: n(it.commission ?? it.affiliate_commission ?? c.commission ?? c.affiliate_commission),
    valor_pedido: n(it.item_price ?? c.order_amount ?? c.purchase_amount),
    reembolsado: !!(it.is_refund ?? c.is_refund ?? c.refunded),
    status: str(c.order_status ?? c.status),
    comprado_em: c.purchase_time ? new Date(Number(c.purchase_time) * 1000).toISOString() : null,
    bruto: { ...c, item_list: [it] },
    coletado_em: new Date().toISOString(),
  }));
}

export async function coletarConversoesAms(lojaId: string, dias = 7): Promise<{ linhas: number; erro?: string }> {
  const tok = await obterTokenAms(lojaId);
  if (!tok) return { linhas: 0, erro: "loja sem o app de afiliados conectado" };
  const p = await nomesParametros();
  const ate = new Date();
  const de = new Date(ate.getTime() - dias * 86400000);
  const fmt = (d: Date) => (p.formato === "ymd" ? d.toISOString().slice(0, 10).replace(/-/g, "") : String(Math.floor(d.getTime() / 1000)));
  let linhas = 0;
  for (let page = 1; page <= 40; page++) {
    const r = await chamarAms("/api/v2/ams/get_conversion_report", tok, `&${p.de}=${fmt(de)}&${p.ate}=${fmt(ate)}&page_no=${page}&page_size=100`);
    if (r.error) return { linhas, erro: `${r.error}: ${r.message}` };
    const resp = (r.response as J) || {};
    const lista = (Array.isArray(resp.conversion_list) ? resp.conversion_list : Array.isArray(resp.list) ? resp.list : Array.isArray(resp.order_list) ? resp.order_list : []) as J[];
    const lote = lista.flatMap((c) => mapearConversao(c, lojaId)).filter((l) => l.order_sn);
    if (lote.length) await supabase.from("afiliados_conversao").upsert(lote, { onConflict: "loja_id,order_sn,item_id" });
    linhas += lote.length;
    if (!resp.more && !resp.has_next_page && lista.length < 100) break;
  }
  return { linhas };
}
