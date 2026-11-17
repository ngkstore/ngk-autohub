import { describe, expect, it } from "vitest";
import { ehFalhaEntrega, eventoRetorno, mapearFalhaEntrega, eventosFalhaEntrega, metaValidacaoFalha, PRAZO_VALIDACAO_FALHA_DIAS } from "@/lib/devolucoes/mapaFalhaEntrega";

// Forma real da API de pedidos (sondagem 12/11/2026), anonimizada.
const LOJA = "00000000-0000-4000-8000-00000000000a";
const pedido = {
  order_sn: "261109S3GDVAT8",
  order_status: "CANCELLED",
  cancel_reason: "Failed Delivery",
  cancel_by: "system",
  create_time: 1794163567,
  update_time: 1794478142,
  total_amount: 24.5,
  buyer_username: "comprador_x",
  recipient_address: { full_address: "Rua Y" },
  item_list: [{ item_id: 1, model_id: 0, item_sku: "FORPAO27", model_sku: "", item_name: "Kit 2 Formas", model_quantity_purchased: 1, model_discounted_price: 24.5 }],
  package_list: [{ package_number: "OFG1", logistics_status: "LOGISTICS_DELIVERY_FAILED", shipping_carrier: "Shopee Xpress" }],
};
const aCaminho = [
  { update_time: 1794478100, logistics_status: "RETURN_STARTED", description: "Pedido será devolvido ao vendedor" },
  { update_time: 1794478000, logistics_status: "PICKED_UP", description: "Seu pedido chegou ao último centro logístico: São Carlos - SP" },
  { update_time: 1794420000, logistics_status: "PICKED_UP", description: "Houve um imprevisto durante a entrega do seu pedido" },
];
const voltou = [{ update_time: 1794700000, logistics_status: "RETURNED", description: "Pedido devolvido ao vendedor" }, ...aCaminho];

describe("Falha de entrega (Shopee) → devolucoes", () => {
  it("detecta pelo cancel_reason ou pelo pacote", () => {
    expect(ehFalhaEntrega(pedido)).toBe(true);
    expect(ehFalhaEntrega({ ...pedido, cancel_reason: "Unpaid Order", package_list: [{ logistics_status: "LOGISTICS_INVALID" }] })).toBe(false);
  });
  it("voltando enquanto não chega; sem prazo", () => {
    const l = mapearFalhaEntrega(pedido, aCaminho, LOJA, new Date(1794500000 * 1000));
    expect(l.tipo).toBe("falha_entrega");
    expect(l.etapa).toBe("voltando");
    expect(l.prazo_resposta).toBeNull();
    expect(l.plataforma_id).toBe("FE-261109S3GDVAT8");
    expect(l.motivo_codigo).toBe("FAILED_DELIVERY");
    expect(l.itens[0].sku).toBe("FORPAO27");
    expect(l.bruto.recipient_address).toBeUndefined();
  });
  it("chegou de volta: validar SEM prazo da plataforma (meta interna só na tela)", () => {
    const l = mapearFalhaEntrega(pedido, voltou, LOJA, new Date(1794700000 * 1000 + 3600 * 1000));
    expect(eventoRetorno(voltou)?.logistics_status).toBe("RETURNED");
    expect(l.etapa).toBe("validar");
    expect(l.chegou_em).toBe(new Date(1794700000 * 1000).toISOString());
    expect(l.prazo_resposta).toBeNull(); // não entra em "Vencem em 24 h" nem como urgente no painel
    expect(metaValidacaoFalha(l.chegou_em)).toBe(new Date(1794700000 * 1000 + PRAZO_VALIDACAO_FALHA_DIAS * 86400000).toISOString());
  });
  it("em validar NUNCA sai por tempo (só inspeção no AutoHub ou encerramento pela Shopee)", () => {
    expect(mapearFalhaEntrega(pedido, voltou, LOJA, new Date(1794700000 * 1000 + (PRAZO_VALIDACAO_FALHA_DIAS + 8) * 86400000)).etapa).toBe("validar");
    expect(mapearFalhaEntrega(pedido, voltou, LOJA, new Date(1794700000 * 1000 + 90 * 86400000), 10).etapa).toBe("validar");
  });
  it("eventos idempotentes", () => {
    const ev = eventosFalhaEntrega(pedido, voltou);
    expect(ev.map((e) => e.chave)).toEqual(["falha_entrega", "retornou"]);
  });
});

describe("Falha de entrega: pacote descartado pela Shopee", () => {
  it("FAILED_DELIVERED / Pedido descartado → encerrado, sem prazo", () => {
    const descartado = [{ update_time: 1794800000, logistics_status: "FAILED_DELIVERED", description: "Pedido descartado" }, ...aCaminho];
    const l = mapearFalhaEntrega(pedido, descartado, LOJA, new Date(1794800000 * 1000 + 3600 * 1000));
    expect(l.etapa).toBe("encerrado");
    expect(l.status_plataforma).toBe("DISCARDED");
    expect(l.prazo_resposta).toBeNull();
  });
});

describe("Falha de entrega (T-004): pedido COMPLETED e pacote que nunca voltou", () => {
  it("pedido COMPLETED com pacote LOGISTICS_DELIVERY_FAILED também é falha de entrega", () => {
    expect(ehFalhaEntrega({ order_sn: "X", order_status: "COMPLETED", cancel_reason: "", package_list: [{ logistics_status: "LOGISTICS_DELIVERY_FAILED" }] })).toBe(true);
    expect(ehFalhaEntrega({ order_sn: "Y", order_status: "COMPLETED", package_list: [{ logistics_status: "LOGISTICS_DELIVERY_DONE" }] })).toBe(false);
  });
  it("sem retorno nem descarte há mais de 60 dias: pacote_nao_retornou (PNR-), com dias parado", () => {
    const parado = [{ update_time: 1794478100, logistics_status: "RETURN_STARTED", description: "O pedido está sendo postado e voltará para você" }];
    const l = mapearFalhaEntrega(pedido, parado, LOJA, new Date(1794478100 * 1000 + 90 * 86400000));
    expect(l.tipo).toBe("pacote_nao_retornou");
    expect(l.plataforma_id).toBe("PNR-261109S3GDVAT8");
    expect(l.etapa).toBe("decisao");
    expect(l.dias_parado).toBe(90);
    expect(l.status_plataforma).toBe("NEVER_RETURNED");
  });
  it("menos de 60 dias voltando continua falha_entrega em trânsito; se voltou, validar", () => {
    expect(mapearFalhaEntrega(pedido, aCaminho, LOJA, new Date(1794478100 * 1000 + 30 * 86400000)).tipo).toBe("falha_entrega");
    expect(mapearFalhaEntrega(pedido, voltou, LOJA, new Date(1794700000 * 1000 + 90 * 86400000)).etapa).toBe("validar");
  });
});
