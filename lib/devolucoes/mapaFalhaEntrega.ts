import { isoDeUnix, num, type DevolucaoLinha, type EventoLinha, type Etapa } from "@/lib/devolucoes/tipos";
import type { EventoRastreio } from "@/lib/shopee/rastreio";

// Falha de entrega (Shopee) — mapeamento PURO. A Shopee não expõe esses casos na API de
// devoluções: eles aparecem na API de PEDIDOS como CANCELLED com cancel_reason "Failed Delivery"
// (cancel_by system) e pacote LOGISTICS_DELIVERY_FAILED; o rastreio mostra RETURN_STARTED
// ("Pedido será devolvido ao vendedor") e depois a entrega de volta ao vendedor.
type J = Record<string, unknown>;
const str = (v: unknown) => (v === null || v === undefined ? null : String(v));

/** META INTERNA (dias) para validar o pacote depois que ele chega — o Seller Center não mostra prazo nem botão
 *  para falhas de entrega (conferido 12/11/2026). Configurável em Configurações (limites.falha_validacao_dias). */
export const PRAZO_VALIDACAO_FALHA_DIAS = 5;
/** Depois da meta + esta folga sem ação registrada, o caso sai da fila. */
const FOLGA_ENCERRAR_DIAS = 7;
/** Meta interna de validação (data) para a tela. */
export const metaValidacaoFalha = (chegouEm: string | null, dias = PRAZO_VALIDACAO_FALHA_DIAS): string | null => (chegouEm ? new Date(new Date(chegouEm).getTime() + dias * 86400000).toISOString() : null);

export const idFalhaEntrega = (orderSn: string) => `FE-${orderSn}`;

export function ehFalhaEntrega(o: J): boolean {
  const motivo = String(o.cancel_reason || "").toLowerCase();
  const pacotes = Array.isArray(o.package_list) ? (o.package_list as J[]) : [];
  return /failed delivery|falha de entrega|falha na entrega/.test(motivo) || pacotes.some((p) => String(p.logistics_status || "").toUpperCase() === "LOGISTICS_DELIVERY_FAILED");
}

// Evento em que o pacote voltou ao vendedor (eventos do mais recente ao mais antigo).
export function eventoRetorno(eventos: EventoRastreio[]): EventoRastreio | null {
  const idx = eventos.findIndex((e) => String(e.logistics_status || "").toUpperCase() === "RETURN_STARTED");
  const depois = idx >= 0 ? eventos.slice(0, idx) : eventos;
  return (
    depois.find((e) => {
      const st = String(e.logistics_status || "").toUpperCase();
      const d = String(e.description || "").toLowerCase();
      return /RETURNED|RETURN_DELIVERED|RETURN_DONE/.test(st) || /devolvido ao vendedor|entregue ao vendedor|retornou ao vendedor|devolu[cç][aã]o conclu[ií]da|recebido pelo vendedor/.test(d);
    }) || null
  );
}

export function mapearFalhaEntrega(o: J, eventos: EventoRastreio[], lojaId: string, agora = new Date(), metaDias = PRAZO_VALIDACAO_FALHA_DIAS): DevolucaoLinha {
  const pacotes = Array.isArray(o.package_list) ? (o.package_list as J[]) : [];
  const retorno = eventoRetorno(eventos);
  const retornouEm = retorno?.update_time ? new Date(Number(retorno.update_time) * 1000) : null;
  // "FAILED_DELIVERED / Pedido descartado": a Shopee descartou o pacote — nada volta, nada a validar
  const descartado = eventos.some((e) => String(e.logistics_status || "").toUpperCase() === "FAILED_DELIVERED" || /descartado/i.test(String(e.description || "")));
  const etapa: Etapa = descartado ? "encerrado" : retornouEm ? "validar" : "voltando";
  // sem prazo da plataforma: prazo_resposta fica nulo (não entra em "Vencem em 24 h" nem como urgente no painel);
  // a meta interna (chegada + metaDias) é calculada na tela
  const prazo: string | null = null;
  // Regra (16/11/2026): caso em "validar" só sai da fila quando for inspecionado no AutoHub ou encerrado pela
  // Shopee (descartado) — NUNCA por tempo, mesmo fora da janela do cron. A meta interna é só aviso na tela.
  void agora;
  void metaDias;
  void FOLGA_ENCERRAR_DIAS;
  const itens = (Array.isArray(o.item_list) ? (o.item_list as J[]) : []).map((it) => ({
    sku: str(it.model_sku) || str(it.item_sku),
    variacao: str(it.model_name),
    nome: str(it.item_name),
    quantidade: Number(it.model_quantity_purchased) || 1,
    valor: num(it.model_discounted_price) ?? num(it.model_original_price),
    imagem: str((it.image_info as J | undefined)?.image_url) || null,
  }));
  const ultimo = eventos[0]?.update_time ? isoDeUnix(eventos[0].update_time) : isoDeUnix(o.update_time);
  return {
    loja_id: lojaId,
    canal: "shopee",
    plataforma_id: idFalhaEntrega(String(o.order_sn)),
    pedido_id: String(o.order_sn),
    tipo: "falha_entrega",
    status_plataforma: descartado ? "DISCARDED" : retornouEm ? "RETURNED_TO_SELLER" : String(pacotes[0]?.logistics_status || "LOGISTICS_DELIVERY_FAILED"),
    etapa,
    motivo_codigo: "FAILED_DELIVERY",
    motivo_texto: str(o.cancel_reason),
    texto_comprador: null,
    valor_pedido: num(o.total_amount),
    valor_reembolso_pedido: num(o.total_amount),
    valor_reembolsado: null,
    prazo_resposta: prazo,
    prazo_prova: null,
    prazo_contestar: null,
    prazo_oferta: null,
    rastreio_reverso: str(pacotes[0]?.package_number) || null,
    transportadora_reversa: str(pacotes[0]?.shipping_carrier) || null,
    chegou_em: retornouEm ? retornouEm.toISOString() : null,
    comprador_id: str(o.buyer_user_id) || str(o.buyer_username),
    comprador_usuario: str(o.buyer_username),
    disputa_status: null,
    compensacao_status: null,
    resultado: null,
    itens,
    bruto: sanitizarPedido(o, eventos),
    plataforma_criado_em: isoDeUnix(o.create_time),
    plataforma_atualizado_em: ultimo,
  };
}

export function sanitizarPedido(o: J, eventos: EventoRastreio[]): J {
  const b: J = { ...o, rastreio: eventos.slice(0, 30) };
  delete b.recipient_address;
  delete b.buyer_user_id;
  return b;
}

export function eventosFalhaEntrega(o: J, eventos: EventoRastreio[]): EventoLinha[] {
  const ev: EventoLinha[] = [];
  const inicio = eventos.find((e) => String(e.logistics_status || "").toUpperCase() === "RETURN_STARTED");
  ev.push({ quando: isoDeUnix(inicio?.update_time) || isoDeUnix(o.update_time) || new Date().toISOString(), origem: "plataforma", tipo: "solicitada", descricao: `Falha de entrega: ${String(o.cancel_reason || "entrega não concluída")} — pacote volta ao vendedor`, chave: "falha_entrega" });
  const retorno = eventoRetorno(eventos);
  if (retorno) ev.push({ quando: isoDeUnix(retorno.update_time) || new Date().toISOString(), origem: "plataforma", tipo: "chegou", descricao: `Pacote devolvido ao vendedor: ${retorno.description || ""}`.trim(), chave: "retornou" });
  return ev;
}
