import { chamarShopee } from "@/lib/shopee/chamar";
import { gravarDevolucao, type ResultadoSync } from "@/lib/devolucoes/sincronizar";
import { ehFalhaEntrega, eventosFalhaEntrega, mapearFalhaEntrega } from "@/lib/devolucoes/mapaFalhaEntrega";
import type { EventoRastreio } from "@/lib/shopee/rastreio";
import { configDevolucoes, contaDaLoja } from "@/lib/devolucoes/config";

type J = Record<string, unknown>;
const JANELA = 15 * 86400; // get_order_list aceita no máximo 15 dias por consulta
const CAMPOS_DETALHE = "package_list,order_status,cancel_reason,cancel_by,update_time,item_list,total_amount,buyer_username";

// Falhas de entrega da Shopee → devolucoes (tipo 'falha_entrega' / 'pacote_nao_retornou').
// Fontes (T-004, 17/11/2026): a falha aparece em DOIS status de pedido —
//   CANCELLED com cancel_reason "Failed Delivery" (pacote ainda voltando / descartado) e
//   COMPLETED com pacote LOGISTICS_DELIVERY_FAILED (o pacote já voltou ao vendedor; a Shopee marca
//   o pedido como concluído). Só listar CANCELLED deixava de fora os "devolvido, aguardando validação".
// O update_time do pedido muda quando o pacote volta, então a janela por update_time pega os dois casos.
export async function sincronizarFalhasEntregaShopee(
  lojaId: string,
  opts: { dias?: number; ateDias?: number; orcamentoMs?: number; status?: ("CANCELLED" | "COMPLETED")[]; diasCompleted?: number; pedidos?: string[] } = {}
): Promise<ResultadoSync & { por_status?: Record<string, number> }> {
  const inicio = Date.now();
  const r: ResultadoSync & { por_status?: Record<string, number> } = { canal: "shopee", loja_id: lojaId, vistos: 0, gravados: 0, eventos: 0, midias: 0, erros: 0, segundos: 0, por_status: {} };
  const agoraUnix = Math.floor(Date.now() / 1000) - (opts.ateDias ?? 0) * 86400;
  const estourou = () => !!opts.orcamentoMs && Date.now() - inicio > opts.orcamentoMs;
  const conta = await contaDaLoja(lojaId);
  const metaDias = conta ? (await configDevolucoes(conta)).limites.falha_validacao_dias : undefined;
  try {
    const sns = new Set<string>(opts.pedidos || []);
    if (!opts.pedidos?.length) {
      // CANCELLED: janela de `dias` (20 d no cron); COMPLETED: janela própria, curta (1 d no cron — ~1 mil pedidos/dia)
      const janelas: { status: "CANCELLED" | "COMPLETED"; dias: number }[] = [];
      const status = opts.status ?? ["CANCELLED", "COMPLETED"];
      if (status.includes("CANCELLED")) janelas.push({ status: "CANCELLED", dias: opts.dias ?? 20 });
      if (status.includes("COMPLETED")) janelas.push({ status: "COMPLETED", dias: opts.diasCompleted ?? opts.dias ?? 1 });
      for (const jn of janelas) {
        const de = agoraUnix - jn.dias * 86400;
        for (let ate = agoraUnix; ate > de && !estourou(); ate -= JANELA) {
          let cursor = "";
          for (let pagina = 0; pagina < 60; pagina++) {
            const q: Record<string, string | number> = { time_range_field: "update_time", time_from: Math.max(de, ate - JANELA + 1), time_to: ate, page_size: 100, order_status: jn.status, response_optional_fields: "order_status" };
            if (cursor) q.cursor = cursor;
            const l = await chamarShopee<{ more?: boolean; next_cursor?: string; order_list?: J[] }>({ lojaId, path: "/api/v2/order/get_order_list", query: q });
            if (l.error) throw new Error(`get_order_list: ${l.error} ${l.message || ""}`);
            for (const o of (l.response?.order_list || []) as J[]) sns.add(String(o.order_sn));
            if (!l.response?.more || !l.response?.next_cursor) break;
            cursor = String(l.response.next_cursor);
          }
        }
      }
    }
    const lista = [...sns];
    const falhas: J[] = [];
    for (let i = 0; i < lista.length && !estourou(); i += 50) {
      const d = await chamarShopee<{ order_list?: J[] }>({ lojaId, path: "/api/v2/order/get_order_detail", query: { order_sn_list: lista.slice(i, i + 50).join(","), response_optional_fields: CAMPOS_DETALHE } });
      if (d.error) throw new Error(`get_order_detail: ${d.error} ${d.message || ""}`);
      for (const o of (d.response?.order_list || []) as J[]) if (ehFalhaEntrega(o)) falhas.push(o);
    }
    r.vistos = falhas.length;
    for (const o of falhas) {
      if (estourou()) break;
      try {
        const t = await chamarShopee<{ tracking_info?: EventoRastreio[] }>({ lojaId, path: "/api/v2/logistics/get_tracking_info", query: { order_sn: String(o.order_sn) } });
        const eventos = (t.response?.tracking_info || []) as EventoRastreio[];
        const linha = mapearFalhaEntrega(o, eventos, lojaId, new Date(), metaDias);
        const g = await gravarDevolucao(linha, eventosFalhaEntrega(o, eventos), []);
        r.gravados++;
        r.eventos += g.eventos;
        const k = `${String(o.order_status)}/${linha.tipo}/${linha.etapa}`;
        r.por_status![k] = (r.por_status![k] || 0) + 1;
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
