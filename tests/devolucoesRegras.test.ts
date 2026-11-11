import { describe, expect, it } from "vitest";
import { avaliarRegras, casa, REGRAS_INICIAIS, type ContextoCaso, type Regra } from "@/lib/devolucoes/regras";

const agora = new Date("2026-11-11T12:00:00Z");
const base: ContextoCaso = {
  canal: "shopee",
  tipo: "devolucao_reembolso",
  etapa: "resposta",
  motivo: "CHANGE_OF_MIND",
  valor: 50,
  prazoResposta: "2026-11-12T12:00:00Z",
  chegou: false,
  lacrado: null,
  pesoEnvioKg: null,
  pesoChegadaKg: null,
  itemDiferente: null,
  entregaConfirmadaComFoto: false,
  suspeito: false,
  devolucoes90d: 0,
  disputaGanhaEm: null,
  creditoStatus: null,
  agora,
};
const regras: Regra[] = REGRAS_INICIAIS.map((r, i) => ({ ...r, id: `r${i}`, ativa: true }));
const porNome = (s: string) => regras.find((r) => r.nome.includes(s))!;

describe("regras iniciais do plano", () => {
  it("1. arrependimento até R$ 60 só com produto lacrado (inspecionado)", () => {
    expect(avaliarRegras(regras, { ...base, lacrado: true })?.nome).toBe(porNome("Arrependimento").nome);
    expect(avaliarRegras(regras, { ...base, lacrado: null })).toBeNull(); // sem inspeção não aprova
    expect(avaliarRegras(regras, { ...base, lacrado: true, valor: 60.01 })).toBeNull();
  });
  it("2. item diferente na volta → disputar (pede aprovação)", () => {
    const r = avaliarRegras(regras, { ...base, motivo: "FUNCTIONAL_DMG", chegou: true, itemDiferente: true });
    expect(r?.acao.tipo).toBe("disputar");
    expect(r?.modo).toBe("aprovar");
  });
  it("2b. peso 20% abaixo do envio → disputar; 19% não", () => {
    expect(avaliarRegras(regras, { ...base, motivo: "X", chegou: true, itemDiferente: false, pesoEnvioKg: 10, pesoChegadaKg: 8 })?.nome).toBe(porNome("Peso na volta").nome);
    expect(casa(porNome("Peso na volta").condicao, { ...base, chegou: true, pesoEnvioKg: 10, pesoChegadaKg: 8.1 })).toBe(false);
  });
  it("3. não recebido com entrega confirmada e foto → disputar", () => {
    expect(avaliarRegras(regras, { ...base, motivo: "NOT_RECEIVED", entregaConfirmadaComFoto: true })?.nome).toBe(porNome("recebido").nome);
    expect(avaliarRegras(regras, { ...base, motivo: "NOT_RECEIVED", entregaConfirmadaComFoto: false })).toBeNull();
  });
  it("4. defeito até R$ 40 → oferecer 40%", () => {
    const r = avaliarRegras(regras, { ...base, motivo: "FUNCTIONAL_DMG", valor: 39.9 });
    expect(r?.acao).toMatchObject({ tipo: "oferecer_parcial", valor_parcial_pct: 40 });
    expect(avaliarRegras(regras, { ...base, motivo: "FUNCTIONAL_DMG", valor: 40.01 })).toBeNull();
  });
  it("5. prazo com menos de 4 h → alerta (automático)", () => {
    const r = avaliarRegras(regras, { ...base, motivo: "X", prazoResposta: "2026-11-11T15:00:00Z" });
    expect(r?.acao.tipo).toBe("alerta");
    expect(r?.modo).toBe("automatico");
  });
  it("6. chegou → tarefa de inspeção", () => {
    expect(avaliarRegras(regras, { ...base, motivo: "X", etapa: "voltando", chegou: true })?.acao.tipo).toBe("tarefa_inspecao");
  });
  it("7. 3+ devoluções em 90 dias → suspeito", () => {
    expect(avaliarRegras(regras, { ...base, motivo: "X", devolucoes90d: 3 })?.acao.tipo).toBe("marcar_suspeito");
    expect(avaliarRegras(regras, { ...base, motivo: "X", devolucoes90d: 2 })).toBeNull();
  });
  it("8. disputa ganha sem crédito há 3 dias → cobrar", () => {
    expect(avaliarRegras(regras, { ...base, motivo: "X", etapa: "encerrado", disputaGanhaEm: "2026-11-07T12:00:00Z", creditoStatus: "aguardando" })?.acao.tipo).toBe("cobrar_credito");
    expect(avaliarRegras(regras, { ...base, motivo: "X", etapa: "encerrado", disputaGanhaEm: "2026-11-07T12:00:00Z", creditoStatus: "creditado" })).toBeNull();
  });
  it("ordem: vale a primeira que bate; regra desligada é ignorada", () => {
    const ctx = { ...base, lacrado: true, prazoResposta: "2026-11-11T13:00:00Z" }; // bate 1 (ordem 10) e 5 (ordem 50)
    expect(avaliarRegras(regras, ctx)?.ordem).toBe(10);
    const semPrimeira = regras.map((r) => (r.ordem === 10 ? { ...r, ativa: false } : r));
    expect(avaliarRegras(semPrimeira, ctx)?.ordem).toBe(50);
  });
});
