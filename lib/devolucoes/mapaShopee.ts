import { isoDeUnix, num, type DevolucaoLinha, type EventoLinha, type Etapa, type MidiaComprador, type Resultado, type TipoDevolucao } from "@/lib/devolucoes/tipos";

// Mapeamento PURO Shopee v2.returns → devolucoes (sem imports de servidor; testável).
type J = Record<string, unknown>;
const str = (v: unknown) => (v === null || v === undefined ? null : String(v));

// Shopee v2.returns — campos do get_return_detail usados no mapeamento.

export const JANELA_SHOPEE_DIAS = 15; // limite da API por consulta

// status da Shopee → etapa do caso (espelha as filas do Seller Center):
//   Validar item: pacote devolvido entregue ao vendedor (logistics_status LOGISTICS_DELIVERY_DONE
//     ou is_arrived_at_warehouse) → "validar", prazo return_seller_due_date.
//   Analisar reembolso aprovado pela Shopee: ACCEPTED, return_solution 1 (só reembolso),
//     validation_type seller_validation, logística não iniciada → "validar", prazo due_date.
//   Agendar coleta: LOGISTICS_PENDING_ARRANGE → "coleta", prazo return_ship_due_date.
//   Em trânsito: tem rastreio ou logística em andamento → "voltando" (sem ação do vendedor).
export function etapaShopee(d: J): Etapa {
  const status = String(d.status || "").toUpperCase();
  const log = String(d.logistics_status || d.reverse_logistics_status || "").toUpperCase();
  const chegou = d.is_arrived_at_warehouse === true || log === "LOGISTICS_DELIVERY_DONE";
  const rastreio = !!d.tracking_number;
  const logisticaAndando = !!log && log !== "LOGISTICS_NOT_STARTED";
  switch (status) {
    case "REQUESTED":
      return "resposta";
    case "PROCESSING":
    case "ACCEPTED":
      if (chegou) return "validar";
      if (log === "LOGISTICS_PENDING_ARRANGE") return "coleta";
      if (String(d.return_solution ?? "") === "1" && String(d.validation_type || "") === "seller_validation" && !rastreio && !logisticaAndando) return "validar";
      if (rastreio || logisticaAndando) return "voltando";
      return d.needs_logistics ? "voltando" : "decisao";
    case "JUDGING":
    case "SELLER_DISPUTE":
      return "decisao";
    case "REFUND_PAID":
    case "CLOSED":
    case "CANCELLED":
      return "encerrado";
    default:
      return "solicitado";
  }
}

const unixOuNull = (v: unknown) => (Number(v) > 0 ? isoDeUnix(v) : null);

// Prazo da PRÓXIMA AÇÃO DO VENDEDOR por etapa (null quando a bola está com a Shopee ou o comprador):
// entra em "Vencem em 24 h", no Painel do dia e nos alertas.
export function prazoAcaoShopee(d: J, etapa: Etapa): string | null {
  switch (etapa) {
    case "resposta":
    case "solicitado":
      return unixOuNull(d.due_date);
    case "validar":
      return unixOuNull(d.return_seller_due_date) ?? unixOuNull(d.due_date);
    case "coleta":
      return unixOuNull(d.return_ship_due_date) ?? unixOuNull(d.due_date);
    default:
      return null;
  }
}

export function resultadoShopee(d: J): Resultado | null {
  const status = String(d.status || "").toUpperCase();
  const comp = String(d.seller_compensation_status || "").toUpperCase();
  if (status === "CANCELLED") return "cancelada_comprador";
  if (status === "REFUND_PAID") return d.is_refund_amount_adjusted ? "parcial" : "aprovada";
  if (status === "CLOSED") {
    if (comp.includes("ACCEPT") || comp.includes("APPROV")) return "ganha";
    if (comp.includes("REJECT")) return "perdida";
    return "recusada";
  }
  return null;
}

export function tipoShopee(d: J): TipoDevolucao {
  const t = String(d.return_refund_type || "").toUpperCase();
  if (t === "RO" || t.includes("REFUND_ONLY") || d.needs_logistics === false) return "so_reembolso";
  return "devolucao_reembolso";
}

// Detalhe da API → linha de `devolucoes` (pura; testável com fixture).
export function mapearDevolucaoShopee(d: J, lojaId: string, chegouEmAnterior?: string | null, agora = new Date()): DevolucaoLinha {
  const user = (d.user as J) || {};
  const itens = (Array.isArray(d.item) ? (d.item as J[]) : []).map((it) => ({
    sku: str(it.item_sku),
    variacao: str(it.variation_sku),
    nome: str(it.name),
    quantidade: Number(it.amount) || 1,
    valor: num(it.item_price),
    imagem: Array.isArray(it.images) ? str((it.images as unknown[])[0]) : null,
  }));
  const status = str(d.status);
  const neg = (d.negotiation as J) || {};
  const prova = (d.seller_proof as J) || {};
  const comp = (d.seller_compensation as J) || {};
  const chegou = d.is_arrived_at_warehouse === true || String(d.logistics_status || "").toUpperCase() === "LOGISTICS_DELIVERY_DONE";
  let etapa = etapaShopee(d);
  // Validação com prazo vencido há mais de 2 dias: a Shopee decide sozinha e o Seller Center tira o caso
  // da fila de ação; fica em "Aguardando plataforma" (decisao sem disputa) até virar REFUND_PAID/CLOSED.
  const prazoAcao = prazoAcaoShopee(d, etapa);
  if (etapa === "validar" && prazoAcao && new Date(prazoAcao).getTime() < agora.getTime() - 2 * 86400000) etapa = "decisao";
  return {
    loja_id: lojaId,
    canal: "shopee",
    plataforma_id: String(d.return_sn),
    pedido_id: String(d.order_sn),
    tipo: tipoShopee(d),
    status_plataforma: status,
    etapa,
    motivo_codigo: str(d.reason),
    motivo_texto: str(d.reason),
    texto_comprador: str(d.text_reason),
    valor_pedido: num(d.amount_before_discount),
    valor_reembolso_pedido: num(d.refund_amount),
    valor_reembolsado: status === "REFUND_PAID" ? num(d.refund_amount) : null,
    prazo_resposta: etapa === "decisao" ? null : prazoAcao,
    prazo_prova: isoDeUnix(prova.seller_proof_deadline ?? d.seller_evidence_deadline),
    prazo_contestar: isoDeUnix(comp.seller_compensation_due_date ?? d.return_seller_due_date),
    prazo_oferta: isoDeUnix(neg.offer_due_date ?? d.offer_due_date),
    rastreio_reverso: str(d.tracking_number) || null,
    transportadora_reversa: str(d.reverse_logistics_channel_name) || null,
    chegou_em: chegou ? chegouEmAnterior || new Date().toISOString() : null,
    comprador_id: str(user.user_id) || str(user.username),
    comprador_usuario: str(user.username),
    disputa_status: str(prova.seller_proof_status ?? d.seller_proof_status) || null,
    compensacao_status: str(comp.seller_compensation_status ?? d.seller_compensation_status) || null,
    resultado: resultadoShopee(d),
    itens,
    bruto: sanitizarBrutoShopee(d),
    plataforma_criado_em: isoDeUnix(d.create_time),
    plataforma_atualizado_em: isoDeUnix(d.update_time),
  };
}

// Nada de e-mail, endereço ou telefone do comprador no banco.
export function sanitizarBrutoShopee(d: J): J {
  const b: J = { ...d };
  if (b.user && typeof b.user === "object") b.user = { username: (b.user as J).username, user_id: (b.user as J).user_id };
  delete b.return_pickup_address;
  delete b.virtual_contact_number;
  return b;
}

export function midiasShopee(d: J): MidiaComprador[] {
  const fotos = (Array.isArray(d.image) ? (d.image as unknown[]) : []).map((u) => ({ tipo: "foto" as const, url: String(u) }));
  const videos = (Array.isArray(d.buyer_videos) ? (d.buyer_videos as J[]) : [])
    .filter((v) => v.video_url)
    .map((v) => ({ tipo: "video" as const, url: String(v.video_url), thumb: str(v.thumbnail_url) }));
  return [...fotos, ...videos];
}

// Eventos derivados do detalhe (status, negociação, prova, compensação) com chave idempotente.
export function eventosShopee(d: J): EventoLinha[] {
  const ev: EventoLinha[] = [];
  const status = String(d.status || "");
  const upd = isoDeUnix(d.update_time) || new Date().toISOString();
  ev.push({ quando: isoDeUnix(d.create_time) || upd, origem: "comprador", tipo: "solicitada", descricao: `Pedido de ${tipoShopee(d) === "so_reembolso" ? "reembolso" : "devolução"}: ${str(d.reason) || "-"}${d.text_reason ? ` — "${d.text_reason}"` : ""}`, chave: "solicitada" });
  if (status) ev.push({ quando: upd, origem: "plataforma", tipo: "status", descricao: `Status ${status}`, dados: { status }, chave: `status:${status}` });
  const neg = (d.negotiation as J) || {};
  if (neg.negotiation_status) ev.push({ quando: upd, origem: "plataforma", tipo: "negociacao", descricao: `Negociação ${neg.negotiation_status}${neg.latest_solution ? ` · solução ${neg.latest_solution}` : ""}`, dados: neg, chave: `neg:${neg.negotiation_status}:${neg.latest_solution ?? ""}` });
  const prova = (d.seller_proof as J) || {};
  if (prova.seller_proof_status) ev.push({ quando: upd, origem: "vendedor", tipo: "prova", descricao: `Prova do vendedor: ${prova.seller_proof_status}`, dados: prova, chave: `prova:${prova.seller_proof_status}` });
  const comp = (d.seller_compensation as J) || {};
  if (comp.seller_compensation_status) ev.push({ quando: upd, origem: "plataforma", tipo: "compensacao", descricao: `Compensação: ${comp.seller_compensation_status}`, dados: comp, chave: `comp:${comp.seller_compensation_status}` });
  if (d.is_arrived_at_warehouse === true) ev.push({ quando: upd, origem: "plataforma", tipo: "chegou", descricao: "Pacote chegou ao armazém", chave: "chegou" });
  return ev;
}

