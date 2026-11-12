import { chamarShopee } from "@/lib/shopee/chamar";
import { gravarDevolucao, type ResultadoSync } from "@/lib/devolucoes/sincronizar";
import { ehFalhaEntrega, eventosFalhaEntrega, mapearFalhaEntrega } from "@/lib/devolucoes/mapaFalhaEntrega";
import type { EventoRastreio } from "@/lib/shopee/rastreio";

type J = Record<string, unknown>;
const JANELA = 15 * 86400; // get_order_list aceita no máximo 15 dias por consulta

// Falhas de entrega da Shopee → devolucoes (tipo 'falha_entrega'). Fonte: API de pedidos
// (CANCELLED por "Failed Delivery") + get_tracking_info para saber se o pacote já voltou.
export async function sincronizarFalhasEntregaShopee(lojaId: string, opts: { dias?: number; orcamentoMs?: number } = {}): Promise<ResultadoSync> {
  const inicio = Date.now();
  const r: ResultadoSync = { canal: "shopee", loja_id: lojaId, vistos: 0, gravados: 0, eventos: 0, midias: 0, erros: 0, segundos: 0 };
  const agora = Math.floor(Date.now() / 1000);
  const de = agora - (opts.dias ?? 45) * 86400;
  const estourou = () => !!opts.orcamentoMs && Date.now() - inicio > opts.orcamentoMs;
  try {
    const sns: string[] = [];
    for (let ate = agora; ate > de && !estourou(); ate -= JANELA) {
      let cursor = "";
      for (let pagina = 0; pagina < 30; pagina++) {
        const q: Record<string, string | number> = { time_range_field: "update_time", time_from: Math.max(de, ate - JANELA + 1), time_to: ate, page_size: 100, order_status: "CANCELLED", response_optional_fields: "order_status" };
        if (cursor) q.cursor = cursor;
        const l = await chamarShopee<{ more?: boolean; next_cursor?: string; order_list?: J[] }>({ lojaId, path: "/api/v2/order/get_order_list", query: q });
        if (l.error) throw new Error(`get_order_list: ${l.error} ${l.message || ""}`);
        sns.push(...((l.response?.order_list || []) as J[]).map((o) => String(o.order_sn)));
        if (!l.response?.more || !l.response?.next_cursor) break;
        cursor = String(l.response.next_cursor);
      }
    }
    const falhas: J[] = [];
    for (let i = 0; i < sns.length && !estourou(); i += 50) {
      const d = await chamarShopee<{ order_list?: J[] }>({ lojaId, path: "/api/v2/order/get_order_detail", query: { order_sn_list: sns.slice(i, i + 50).join(","), response_optional_fields: "package_list,order_status,cancel_reason,cancel_by,update_time,item_list,total_amount,buyer_username" } });
      if (d.error) throw new Error(`get_order_detail: ${d.error} ${d.message || ""}`);
      for (const o of (d.response?.order_list || []) as J[]) if (ehFalhaEntrega(o)) falhas.push(o);
    }
    r.vistos = falhas.length;
    for (const o of falhas) {
      if (estourou()) break;
      try {
        const t = await chamarShopee<{ tracking_info?: EventoRastreio[] }>({ lojaId, path: "/api/v2/logistics/get_tracking_info", query: { order_sn: String(o.order_sn) } });
        const eventos = (t.response?.tracking_info || []) as EventoRastreio[];
        const g = await gravarDevolucao(mapearFalhaEntrega(o, eventos, lojaId), eventosFalhaEntrega(o, eventos), []);
        r.gravados++;
        r.eventos += g.eventos;
      } catch (e) {
        r.erros++;
        r.ultimo_erro = e instanceof Error ? e.message : String(e);
      }
    }
  } catch (e) {
    r.erros++;
    r.ultimo_erro = e instanceof Error ? e.message : String(e);
  }
  r.segundos = Math.round((Date.now() - inicio) / 1000);
  return r;
}
