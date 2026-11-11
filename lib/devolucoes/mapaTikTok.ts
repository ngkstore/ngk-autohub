import { isoDeUnix, num, type DevolucaoLinha, type EventoLinha, type Etapa, type MidiaComprador, type Resultado, type TipoDevolucao } from "@/lib/devolucoes/tipos";

// Mapeamento PURO TikTok return_refund → devolucoes (sem imports de servidor; testável).
type J = Record<string, unknown>;
const str = (v: unknown) => (v === null || v === undefined ? null : String(v));


// return_status do TikTok → etapa.
export function etapaTikTok(ro: J): Etapa {
  const s = String(ro.return_status || "").toUpperCase();
  const acoes = (Array.isArray(ro.seller_next_action_response) ? (ro.seller_next_action_response as J[]) : []).map((a) => String(a.action || ""));
  if (s === "RETURN_OR_REFUND_REQUEST_PENDING") return "resposta";
  if (s === "AWAITING_BUYER_SHIP") return "voltando";
  if (s === "BUYER_SHIPPED_ITEM") return acoes.includes("SELLER_RESPOND_RECEIVE_PACKAGE") && ro.arrived_at_warehouse === true ? "recebido" : "voltando";
  if (s === "REJECT_RECEIVE_PACKAGE" || s === "AWAITING_BUYER_RESPONSE") return "decisao";
  if (s.endsWith("_SUCCESS") || s.endsWith("_COMPLETE") || s.endsWith("_CANCEL") || s.endsWith("_REJECT")) return "encerrado";
  if (String(ro.arbitration_status || "").toUpperCase().includes("IN_PROGRESS")) return "decisao";
  return "solicitado";
}

export function resultadoTikTok(ro: J): Resultado | null {
  const s = String(ro.return_status || "").toUpperCase();
  if (s.endsWith("_CANCEL")) return "cancelada_comprador";
  if (s === "REFUND_OR_RETURN_REQUEST_REJECT") return "recusada";
  if (s.endsWith("_SUCCESS") || s.endsWith("_COMPLETE")) {
    const arb = String(ro.arbitration_status || "").toUpperCase();
    if (arb.includes("SELLER_WIN") || arb.includes("SELLER_SUCCESS")) return "ganha";
    if (arb.includes("BUYER_WIN") || arb.includes("SELLER_FAIL")) return "perdida";
    return ro.is_partial_refund === true ? "parcial" : "aprovada";
  }
  return null;
}

export function tipoTikTok(ro: J): TipoDevolucao {
  const t = String(ro.return_type || "").toUpperCase();
  if (t === "REFUND") return "so_reembolso";
  if (t === "REPLACEMENT") return "troca";
  return "devolucao_reembolso";
}

function prazoAcao(ro: J, acoes: string[]): string | null {
  const lista = Array.isArray(ro.seller_next_action_response) ? (ro.seller_next_action_response as J[]) : [];
  const a = lista.find((x) => acoes.includes(String(x.action || "")));
  return a ? isoDeUnix(a.deadline) : null;
}

// return order (returns/search) → linha de `devolucoes` (pura; testável).
export function mapearDevolucaoTikTok(ro: J, lojaId: string, chegouEmAnterior?: string | null): DevolucaoLinha {
  const refund = (ro.refund_amount as J) || {};
  const antes = (Array.isArray(ro.discount_amount) ? (ro.discount_amount as J[])[0] : {}) || {};
  const itens = (Array.isArray(ro.return_line_items) ? (ro.return_line_items as J[]) : []).map((it) => ({
    sku: str(it.seller_sku),
    variacao: str(it.sku_name),
    nome: str(it.product_name),
    quantidade: Number(it.quantity) || 1,
    valor: num(((it.refund_amount as J) || {}).refund_subtotal),
    imagem: str(((it.product_image as J) || {}).url),
  }));
  const s = String(ro.return_status || "");
  const encerradoOk = s.endsWith("_SUCCESS") || s.endsWith("_COMPLETE");
  const chegou = ro.arrived_at_warehouse === true;
  const prazoResposta = prazoAcao(ro, ["SELLER_RESPOND_RETURN_REQUEST", "SELLER_RESPOND_REFUND_REQUEST", "SELLER_RESPOND_RECEIVE_PACKAGE", "SELLER_CONFIRM_RECEIVE_PACKAGE"]);
  return {
    loja_id: lojaId,
    canal: "tiktok",
    plataforma_id: String(ro.return_id),
    pedido_id: String(ro.order_id),
    tipo: tipoTikTok(ro),
    status_plataforma: s || null,
    etapa: etapaTikTok(ro),
    motivo_codigo: str(ro.return_reason),
    motivo_texto: str(ro.return_reason_text),
    texto_comprador: str(ro.buyer_comment) || null,
    valor_pedido: num(refund.refund_subtotal) !== null ? (num(refund.refund_subtotal) as number) + (num(antes.product_seller_discount) || 0) : null,
    valor_reembolso_pedido: num(refund.refund_total),
    valor_reembolsado: encerradoOk ? num(refund.refund_total) : null,
    prazo_resposta: prazoResposta,
    prazo_prova: prazoAcao(ro, ["SELLER_UPLOAD_EVIDENCE", "SELLER_PROVIDE_EVIDENCE"]),
    prazo_contestar: prazoAcao(ro, ["SELLER_APPEAL", "SELLER_RAISE_ARBITRATION"]),
    prazo_oferta: null,
    rastreio_reverso: str(ro.return_tracking_number) || null,
    transportadora_reversa: str(ro.return_provider_name) || null,
    chegou_em: chegou ? chegouEmAnterior || new Date().toISOString() : null,
    comprador_id: str(ro.buyer_user_id) || str(ro.buyer_id) || null,
    comprador_usuario: str(ro.buyer_nickname) || null,
    disputa_status: str(ro.arbitration_status) || null,
    compensacao_status: null,
    resultado: resultadoTikTok(ro),
    itens,
    bruto: sanitizarBrutoTikTok(ro),
    plataforma_criado_em: isoDeUnix(ro.create_time),
    plataforma_atualizado_em: isoDeUnix(ro.update_time),
  };
}

export function sanitizarBrutoTikTok(ro: J): J {
  const b: J = { ...ro };
  delete b.return_warehouse_address;
  delete b.buyer_address;
  delete b.buyer_phone;
  delete b.buyer_email;
  return b;
}

// Cancelamento (cancellations/search) → linha tipo `cancelamento`.
export function mapearCancelamentoTikTok(c: J, lojaId: string): DevolucaoLinha {
  const refund = (c.refund_amount as J) || {};
  const s = String(c.cancel_status || "");
  const itens = (Array.isArray(c.cancel_line_items) ? (c.cancel_line_items as J[]) : []).map((it) => ({
    sku: str(it.seller_sku),
    variacao: str(it.sku_name),
    nome: str(it.product_name),
    quantidade: Number(it.quantity) || 1,
    valor: num(((it.refund_amount as J) || {}).refund_subtotal),
    imagem: str(((it.product_image as J) || {}).url),
  }));
  const pendente = s === "CANCELLATION_REQUEST_PENDING";
  const encerrado = s.endsWith("_SUCCESS") || s.endsWith("_COMPLETE") || s.endsWith("_REJECT") || s.endsWith("_CANCEL");
  return {
    loja_id: lojaId,
    canal: "tiktok",
    plataforma_id: String(c.cancel_id),
    pedido_id: String(c.order_id),
    tipo: "cancelamento",
    status_plataforma: s || null,
    etapa: pendente ? "resposta" : encerrado ? "encerrado" : "decisao",
    motivo_codigo: str(c.cancel_reason),
    motivo_texto: str(c.cancel_reason_text),
    texto_comprador: null,
    valor_pedido: null,
    valor_reembolso_pedido: num(refund.refund_total),
    valor_reembolsado: s.endsWith("_SUCCESS") || s.endsWith("_COMPLETE") ? num(refund.refund_total) : null,
    prazo_resposta: prazoAcao(c, ["SELLER_RESPOND_CANCELLATION_REQUEST"]),
    prazo_prova: null,
    prazo_contestar: null,
    prazo_oferta: null,
    rastreio_reverso: null,
    transportadora_reversa: null,
    chegou_em: null,
    comprador_id: str(c.buyer_user_id) || null,
    comprador_usuario: null,
    disputa_status: null,
    compensacao_status: null,
    resultado: s.endsWith("_SUCCESS") || s.endsWith("_COMPLETE") ? "aprovada" : s.endsWith("_REJECT") ? "recusada" : s.endsWith("_CANCEL") ? "cancelada_comprador" : null,
    itens,
    bruto: c,
    plataforma_criado_em: isoDeUnix(c.create_time),
    plataforma_atualizado_em: isoDeUnix(c.update_time),
  };
}

// records (histórico) → eventos + mídias do comprador.
export function eventosTikTok(records: J[]): { eventos: EventoLinha[]; midias: MidiaComprador[] } {
  const eventos: EventoLinha[] = [];
  const midias: MidiaComprador[] = [];
  for (const r of records) {
    const quando = isoDeUnix(r.create_time) || new Date().toISOString();
    const role = String(r.role || "").toUpperCase();
    const origem = role === "BUYER" ? "comprador" : role === "SELLER" ? "vendedor" : "plataforma";
    const evento = String(r.event || "evento");
    eventos.push({
      quando,
      origem,
      tipo: evento.toLowerCase(),
      descricao: [r.description, r.reason_text, r.note].filter(Boolean).map(String).join(" · ") || evento,
      dados: { event: evento, role },
      chave: `tt:${evento}:${r.create_time}`,
    });
    for (const img of Array.isArray(r.images) ? (r.images as J[]) : []) {
      const url = str(img.url) || str(img);
      if (url && origem === "comprador") midias.push({ tipo: "foto", url, legenda: str(r.note) });
    }
    for (const v of Array.isArray(r.videos) ? (r.videos as J[]) : []) {
      const url = str(v.url) || str(v.video_url) || str(v);
      if (url && origem === "comprador") midias.push({ tipo: "video", url, thumb: str(v.cover_url) });
    }
  }
  return { eventos, midias };
}

