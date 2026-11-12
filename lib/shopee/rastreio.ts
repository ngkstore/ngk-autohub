// Leitura PURA do rastreio da Shopee (get_tracking_info) — sem imports de servidor; testável.
export const UFS = new Set([
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB",
  "PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO",
]);

export type EventoRastreio = { update_time?: number; logistics_status?: string; description?: string };

// Lê o rastreio (eventos do mais recente ao mais antigo): data de coleta, data de entrega e UF.
// UF de destino = o "cidade - UF" mais recente SÓ depois que o pacote foi entregue (ou saiu
// para entrega). Antes disso o evento mais recente é o hub de origem/trânsito — foi assim que
// 11,6 mil pedidos da NGK viraram "PR" (origem) em vez do estado do comprador (12/11/2026).
export function analisarRastreio(eventos: EventoRastreio[]): { enviado_em: string | null; entregue_em: string | null; uf: string | null } {
  let enviado: number | null = null;
  let entregue: number | null = null;
  let chegouNoDestino = false;
  let uf: string | null = null;
  for (const e of eventos) {
    const st = (e.logistics_status || "").toUpperCase();
    const desc = e.description || "";
    const d = desc.toLowerCase();
    if (!enviado && (st.includes("PICKED_UP") || d.includes("coletado") || d.includes("postado"))) {
      enviado = e.update_time ?? null;
    }
    const entregueAqui = st.includes("DELIVERED") || st === "LOGISTICS_DELIVERY_DONE" || /\bentregue\b/.test(d);
    const saiuParaEntrega = st.includes("OUT_FOR_DELIVERY") || d.includes("saiu para entrega") || d.includes("em rota de entrega");
    if (entregueAqui && !entregue) entregue = e.update_time ?? null;
    if (entregueAqui || saiuParaEntrega) chegouNoDestino = true;
    if (chegouNoDestino && !uf) {
      const m = desc.match(/[-–]\s*([A-Z]{2})\s*$/);
      if (m && UFS.has(m[1])) uf = m[1];
    }
  }
  return {
    enviado_em: enviado ? new Date(enviado * 1000).toISOString() : null,
    entregue_em: entregue ? new Date(entregue * 1000).toISOString() : null,
    uf,
  };
}
