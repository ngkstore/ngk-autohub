import { describe, expect, it } from "vitest";
import { analisarRastreio } from "@/lib/shopee/regiao";

// Eventos como o get_tracking_info devolve: do mais recente ao mais antigo.
const emTransito = [
  { update_time: 1794300000, logistics_status: "LOGISTICS_REQUEST_CREATED", description: "Chegou ao centro logístico: Curitiba - PR" },
  { update_time: 1794200000, logistics_status: "LOGISTICS_PICKUP_DONE", description: "Pedido coletado pela transportadora: São José dos Pinhais - PR" },
];
const entregue = [
  { update_time: 1794500000, logistics_status: "LOGISTICS_DELIVERY_DONE", description: "Pedido entregue: Campinas - SP" },
  { update_time: 1794450000, logistics_status: "LOGISTICS_DELIVERY", description: "Saiu para entrega: Campinas - SP" },
  ...emTransito,
];

describe("UF do comprador pelo rastreio (Vendas por UF)", () => {
  it("em trânsito: o hub mais recente é a ORIGEM (PR) — não vira UF", () => {
    const r = analisarRastreio(emTransito);
    expect(r.uf).toBeNull();
    expect(r.enviado_em).not.toBeNull();
    expect(r.entregue_em).toBeNull();
  });
  it("entregue: UF do evento de entrega (SP), não da origem", () => {
    const r = analisarRastreio(entregue);
    expect(r.uf).toBe("SP");
    expect(r.entregue_em).toBe(new Date(1794500000 * 1000).toISOString());
  });
  it("saiu para entrega já define a UF de destino", () => {
    expect(analisarRastreio(entregue.slice(1)).uf).toBe("SP");
  });
});
