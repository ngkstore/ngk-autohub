import { supabase } from "@/lib/supabase";
import { chamarAms, obterTokenAms } from "@/lib/shopee/ams";

// E3 — Shopee AMS v2.ams.get_conversion_report → afiliados_conversao (comissão por pedido e
// item, reembolso e canal). Parâmetros confirmados pelo Gabriel em 11/11/2026:
//   page_no (1…) e page_size (≤ 500; page_no × page_size ≤ 10000);
//   intervalos unix em segundos, inclusivos: place_order_time_start/end,
//   order_completed_time_start/end, conversion_completed_time_start/end,
//   ams_deduction_time_start/end; janela máxima 3 meses; mais de um intervalo = interseção.
// O fim não pode passar da data já consolidada ("too late, the data has not been updated"):
// usamos agora − 3 dias. Resposta: { has_more, list[], total_count }.
type J = Record<string, unknown>;
const n = (v: unknown) => (v === null || v === undefined || v === "" || v === "--" ? null : Number(String(v).replace("%", "")) || 0);
const str = (v: unknown) => (v === null || v === undefined || v === "--" ? null : String(v));
const dataBRT = (v: unknown) => {
  const s = str(v);
  if (!s) return null;
  const d = new Date(s.replace(" ", "T") + "-03:00");
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

export function mapearConversao(c: J, lojaId: string) {
  const itens = Array.isArray(c.items) && (c.items as J[]).length ? (c.items as J[]) : [{}];
  return itens.map((it) => ({
    loja_id: lojaId,
    order_sn: String(c.order_sn ?? ""),
    item_id: str(it.item_id) ?? "",
    affiliate_id: str(c.affiliate_id),
    affiliate_username: str(c.affiliate_username) ?? str(c.affiliate_name),
    canal: str(c.channel),
    comissao: n(it.item_brand_commission) ?? n(c.order_brand_commission),
    valor_pedido: n(it.purchase_value) ?? n(it.price),
    reembolsado: (n(it.refund_amount) ?? 0) > 0,
    status: str(c.order_status),
    comprado_em: dataBRT(c.place_order_time),
    bruto: { ...c, items: [it] },
    coletado_em: new Date().toISOString(),
  }));
}

export async function coletarConversoesAms(lojaId: string, dias = 7): Promise<{ linhas: number; erro?: string }> {
  const tok = await obterTokenAms(lojaId);
  if (!tok) return { linhas: 0, erro: "loja sem o app de afiliados conectado" };
  const fim = Math.floor(Date.now() / 1000) - 3 * 86400;
  const ini = fim - Math.min(dias, 89) * 86400;
  let linhas = 0;
  for (let page = 1; page <= 100; page++) {
    const r = await chamarAms("/api/v2/ams/get_conversion_report", tok, `&place_order_time_start=${ini}&place_order_time_end=${fim}&page_no=${page}&page_size=100`);
    if (r.error) return { linhas, erro: `${r.error}: ${r.message}` };
    const resp = (r.response as J) || {};
    const lista = (Array.isArray(resp.list) ? resp.list : []) as J[];
    const lote = lista.flatMap((c) => mapearConversao(c, lojaId)).filter((l) => l.order_sn);
    if (lote.length) await supabase.from("afiliados_conversao").upsert(lote, { onConflict: "loja_id,order_sn,item_id" });
    linhas += lote.length;
    if (!resp.has_more || lista.length === 0) break;
  }
  return { linhas };
}
