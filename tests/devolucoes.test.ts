import { describe, expect, it } from "vitest";
import { etapaShopee, eventosShopee, mapearDevolucaoShopee, midiasShopee, resultadoShopee, sanitizarBrutoShopee } from "@/lib/devolucoes/mapaShopee";
import { etapaTikTok, eventosTikTok, mapearCancelamentoTikTok, mapearDevolucaoTikTok, resultadoTikTok } from "@/lib/devolucoes/mapaTikTok";

// Exemplos ANONIMIZADOS com a forma das respostas reais (B0, 11/11/2026).
const LOJA = "00000000-0000-4000-8000-00000000000a";

const shopee = {
  image: ["https://cf.shopee.com.br/file/foto1"],
  buyer_videos: [{ thumbnail_url: "https://x/cover", video_url: "https://x/video.mp4" }],
  reason: "FUNCTIONAL_DMG",
  text_reason: "Com uma semana de uso o produto parou de funcionar",
  return_sn: "2611010ABCDEF01",
  refund_amount: 844.9,
  currency: "BRL",
  create_time: 1793136668,
  update_time: 1793922386,
  status: "REQUESTED",
  due_date: 1793309467,
  tracking_number: "",
  needs_logistics: true,
  amount_before_discount: 982.26,
  user: { username: "comprador_teste", email: "**************84@gmail.com", portrait: "" },
  item: [{ item_id: 1, model_id: 2, name: "Climatizador de Ar 45 L", images: ["https://x/i1"], amount: 1, item_price: 869.9, item_sku: "CLIAR", variation_sku: "CLIAR220V" }],
  order_sn: "2610280XYZ",
  return_ship_due_date: 0,
  return_seller_due_date: 1793500000,
  seller_proof: { seller_proof_status: "PENDING", seller_proof_deadline: 1793400000 },
  seller_compensation: { seller_compensation_status: "NOT_REQUIRED", seller_compensation_due_date: 0 },
  negotiation: { negotiation_status: "PENDING_RESPOND", latest_solution: "RETURN_REFUND", offer_due_date: 1793450000 },
  return_pickup_address: { full_address: "Rua X, 123" },
  virtual_contact_number: "+55 11 99999-0000",
  return_refund_type: "RR",
  is_arrived_at_warehouse: false,
  is_refund_amount_adjusted: false,
};

describe("Shopee → devolucoes", () => {
  const l = mapearDevolucaoShopee(shopee, LOJA);
  it("identidade e valores", () => {
    expect(l.canal).toBe("shopee");
    expect(l.plataforma_id).toBe("2611010ABCDEF01");
    expect(l.pedido_id).toBe("2610280XYZ");
    expect(l.tipo).toBe("devolucao_reembolso");
    expect(l.valor_pedido).toBe(982.26);
    expect(l.valor_reembolso_pedido).toBe(844.9);
    expect(l.valor_reembolsado).toBeNull();
  });
  it("etapa resposta com prazos convertidos", () => {
    expect(l.etapa).toBe("resposta");
    expect(l.prazo_resposta).toBe(new Date(1793309467 * 1000).toISOString());
    expect(l.prazo_prova).toBe(new Date(1793400000 * 1000).toISOString());
    expect(l.prazo_oferta).toBe(new Date(1793450000 * 1000).toISOString());
  });
  it("comprador: só nome de usuário; bruto sem endereço, telefone e e-mail", () => {
    expect(l.comprador_usuario).toBe("comprador_teste");
    const b = sanitizarBrutoShopee(shopee);
    expect(b.return_pickup_address).toBeUndefined();
    expect(b.virtual_contact_number).toBeUndefined();
    expect((b.user as Record<string, unknown>).email).toBeUndefined();
    expect(JSON.stringify(l.bruto)).not.toContain("gmail");
  });
  it("itens e mídias", () => {
    expect(l.itens[0]).toMatchObject({ sku: "CLIAR", variacao: "CLIAR220V", quantidade: 1, valor: 869.9 });
    expect(midiasShopee(shopee)).toEqual([
      { tipo: "foto", url: "https://cf.shopee.com.br/file/foto1" },
      { tipo: "video", url: "https://x/video.mp4", thumb: "https://x/cover" },
    ]);
  });
  it("eventos com chave idempotente", () => {
    const ev = eventosShopee(shopee);
    expect(ev.map((e) => e.chave)).toEqual(["solicitada", "status:REQUESTED", "neg:PENDING_RESPOND:RETURN_REFUND", "prova:PENDING", "comp:NOT_REQUIRED"]);
  });
  it("etapas e resultados por status", () => {
    expect(etapaShopee({ status: "ACCEPTED", tracking_number: "BR1", needs_logistics: true })).toBe("voltando");
    expect(etapaShopee({ status: "ACCEPTED", is_arrived_at_warehouse: true })).toBe("validar");
    // Seller Center "Validar item": pacote entregue de volta ao vendedor
    expect(etapaShopee({ status: "PROCESSING", logistics_status: "LOGISTICS_DELIVERY_DONE", tracking_number: "BR2", needs_logistics: true })).toBe("validar");
    // Seller Center "Analisar reembolso aprovado pela Shopee": só reembolso, pendente validação do vendedor
    expect(etapaShopee({ status: "ACCEPTED", return_solution: 1, validation_type: "seller_validation", logistics_status: "", reverse_logistics_status: "LOGISTICS_NOT_STARTED", needs_logistics: true })).toBe("validar");
    // Seller Center "Agendar coleta"
    expect(etapaShopee({ status: "PROCESSING", logistics_status: "LOGISTICS_PENDING_ARRANGE", needs_logistics: true })).toBe("coleta");
    // em trânsito de verdade: sem ação do vendedor
    expect(etapaShopee({ status: "PROCESSING", logistics_status: "LOGISTICS_PICKUP_DONE", tracking_number: "BR3", needs_logistics: true })).toBe("voltando");
    expect(etapaShopee({ status: "PROCESSING", logistics_status: "LOGISTICS_REQUEST_CREATED", needs_logistics: true })).toBe("voltando");
    expect(etapaShopee({ status: "JUDGING" })).toBe("decisao");
    expect(etapaShopee({ status: "REFUND_PAID" })).toBe("encerrado");
    expect(resultadoShopee({ status: "REFUND_PAID", is_refund_amount_adjusted: true })).toBe("parcial");
    expect(resultadoShopee({ status: "CANCELLED" })).toBe("cancelada_comprador");
    expect(resultadoShopee({ status: "CLOSED", seller_compensation_status: "ACCEPTED" })).toBe("ganha");
    expect(mapearDevolucaoShopee({ ...shopee, status: "REFUND_PAID" }, LOJA).valor_reembolsado).toBe(844.9);
    expect(mapearDevolucaoShopee({ ...shopee, return_refund_type: "RO", needs_logistics: false }, LOJA).tipo).toBe("so_reembolso");
  });
});

const tiktok = {
  return_id: "4042887300707223408",
  order_id: "586791757947504496",
  create_time: 1793488044,
  update_time: 1794329694,
  return_type: "RETURN_AND_REFUND",
  return_status: "BUYER_SHIPPED_ITEM",
  return_reason: "ecom_order_delivered_refund_and_return_reason_not_match_description",
  return_reason_text: "Item doesn't match description",
  refund_amount: { currency: "BRL", refund_shipping_fee: "0", refund_subtotal: "179.9", refund_tax: "0", refund_total: "179.9" },
  discount_amount: [{ currency: "BRL", product_platform_discount: "0", product_seller_discount: "70", shipping_fee_platform_discount: "22.21", shipping_fee_seller_discount: "0" }],
  return_tracking_number: "AP000000000BR",
  return_provider_name: "Correios",
  seller_next_action_response: [{ action: "SELLER_RESPOND_RECEIVE_PACKAGE", deadline: 1794502494 }],
  return_line_items: [{ seller_sku: "CINCAT4PÇ", sku_name: "KIT 4 PEÇAS", product_name: "Cinta Catraca 5T", product_image: { url: "https://x/p.jpg" }, refund_amount: { refund_subtotal: "179.9" } }],
  return_warehouse_address: { full_address: "Novo Mundo, Curitiba" },
  role: "BUYER",
};

describe("TikTok → devolucoes", () => {
  const l = mapearDevolucaoTikTok(tiktok, LOJA);
  it("identidade, tipo, valores e prazo da próxima ação", () => {
    expect(l.canal).toBe("tiktok");
    expect(l.plataforma_id).toBe("4042887300707223408");
    expect(l.tipo).toBe("devolucao_reembolso");
    expect(l.valor_reembolso_pedido).toBe(179.9);
    expect(l.valor_pedido).toBe(249.9); // subtotal + desconto do vendedor
    expect(l.etapa).toBe("voltando");
    expect(l.prazo_resposta).toBe(new Date(1794502494 * 1000).toISOString());
    expect(l.rastreio_reverso).toBe("AP000000000BR");
    expect(l.transportadora_reversa).toBe("Correios");
    expect(l.itens[0]).toMatchObject({ sku: "CINCAT4PÇ", variacao: "KIT 4 PEÇAS", valor: 179.9 });
    expect(l.bruto.return_warehouse_address).toBeUndefined();
  });
  it("etapas e resultados por status", () => {
    expect(etapaTikTok({ return_status: "RETURN_OR_REFUND_REQUEST_PENDING" })).toBe("resposta");
    expect(etapaTikTok({ return_status: "AWAITING_BUYER_RESPONSE" })).toBe("decisao");
    expect(etapaTikTok({ return_status: "RETURN_OR_REFUND_REQUEST_SUCCESS" })).toBe("encerrado");
    expect(resultadoTikTok({ return_status: "RETURN_OR_REFUND_REQUEST_SUCCESS" })).toBe("aprovada");
    expect(resultadoTikTok({ return_status: "REFUND_OR_RETURN_REQUEST_REJECT" })).toBe("recusada");
    expect(resultadoTikTok({ return_status: "RETURN_OR_REFUND_REQUEST_CANCEL" })).toBe("cancelada_comprador");
  });
  it("records viram eventos e mídias do comprador", () => {
    const { eventos, midias } = eventosTikTok([
      { create_time: 1793488044, event: "RETURN_REQUESTED", role: "BUYER", description: "Buyer requested a return", note: "veio errado", images: [{ url: "https://x/a.jpg" }], videos: [] },
      { create_time: 1793490000, event: "SELLER_APPROVED", role: "SELLER", description: "Seller approved", images: [], videos: [] },
    ]);
    expect(eventos.map((e) => [e.origem, e.tipo, e.chave])).toEqual([
      ["comprador", "return_requested", "tt:RETURN_REQUESTED:1793488044"],
      ["vendedor", "seller_approved", "tt:SELLER_APPROVED:1793490000"],
    ]);
    expect(midias).toEqual([{ tipo: "foto", url: "https://x/a.jpg", legenda: "veio errado" }]);
  });
  it("cancelamento", () => {
    const c = mapearCancelamentoTikTok({ cancel_id: "c1", order_id: "o1", cancel_status: "CANCELLATION_REQUEST_PENDING", cancel_reason: "x", refund_amount: { refund_total: "10" }, seller_next_action_response: [{ action: "SELLER_RESPOND_CANCELLATION_REQUEST", deadline: 1794502494 }], create_time: 1, update_time: 2 }, LOJA);
    expect(c.tipo).toBe("cancelamento");
    expect(c.etapa).toBe("resposta");
    expect(c.valor_reembolso_pedido).toBe(10);
    expect(c.prazo_resposta).toBe(new Date(1794502494 * 1000).toISOString());
  });
});
