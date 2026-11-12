// Conferência "tela × banco" das devoluções: as abas da fila (/devolucoes) e o KPI
// "Vencem em 24 h" têm de bater com a contagem direta em `devolucoes`
// (conferencia_devolucoes_etapas). Pulado sem acesso ao banco.
import { describe, expect, it } from "vitest";
import { banco, rpc, temBanco } from "./banco";
import { casoNaAba, type CasoParaAba } from "@/lib/devolucoes/abas";

describe.skipIf(!temBanco())("Devoluções × banco", () => {
  it("abas da fila = contagem direta por etapa", async () => {
    const { data } = await banco().from("devolucoes").select("id, etapa, prazo_resposta, prazo_prova, disputa_status, compensacao_status").neq("etapa", "encerrado").limit(5000);
    const abertas = ((data || []) as unknown) as CasoParaAba[];
    const conta = (id: string) => abertas.filter((d) => casoNaAba(id, d)).length;
    const direto = await rpc<Record<string, number>>("conferencia_devolucoes_etapas", { p_loja_ids: null });
    expect(conta("responder")).toBe(Number(direto.responder));
    expect(conta("transito")).toBe(Number(direto.transito));
    expect(conta("inspecionar")).toBe(Number(direto.validar));
    expect(conta("disputa")).toBe(Number(direto.disputa));
    expect(conta("plataforma")).toBe(Number(direto.plataforma));
  });

  it("casos de validação (Validar item / reembolso aprovado) têm prazo e não ficam em trânsito", async () => {
    const { data } = await banco().from("devolucoes").select("id, etapa, prazo_resposta, bruto").eq("canal", "shopee").neq("etapa", "encerrado").limit(5000);
    for (const d of (data || []) as { id: string; etapa: string; prazo_resposta: string | null; bruto: Record<string, unknown> }[]) {
      const log = String(d.bruto?.logistics_status || "");
      if (log === "LOGISTICS_DELIVERY_DONE" && ["ACCEPTED", "PROCESSING"].includes(String(d.bruto?.status))) {
        expect(["validar", "recebido", "inspecao"], `caso ${d.id}: pacote entregue de volta deveria estar em validar`).toContain(d.etapa);
      }
      if (log === "LOGISTICS_PENDING_ARRANGE" && ["ACCEPTED", "PROCESSING"].includes(String(d.bruto?.status))) {
        expect(d.etapa, `caso ${d.id}: pendente de coleta`).toBe("coleta");
      }
      if (d.etapa === "validar" || d.etapa === "coleta") expect(d.prazo_resposta, `caso ${d.id} sem prazo de ação`).not.toBeNull();
    }
  });
});
