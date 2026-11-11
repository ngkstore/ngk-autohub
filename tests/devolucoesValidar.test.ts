import { describe, expect, it } from "vitest";
import { validarAcao, prazoCritico, type ContextoValidacao } from "@/lib/devolucoes/validar";

const limites = { auto_caso_max: 100, auto_dia_max: 500, alerta_horas: 4, suspeito_devolucoes_90d: 3, credito_dias: 3 };
const base: ContextoValidacao = { flagLigada: true, valorCaso: 60, somaAutomaticaHoje: 0, compradorSuspeito: false, limites, modo: "automatico" };

describe("limites fixos do módulo de Devoluções", () => {
  it("flag desligada: nada é enviado, nem com humano", () => {
    const v = validarAcao({ tipo: "aprovar" }, { ...base, flagLigada: false, modo: "aprovado" });
    expect(v.ok).toBe(false);
    expect(v.motivo).toMatch(/desligadas/);
  });
  it("aprovação automática até R$ 100 por caso", () => {
    expect(validarAcao({ tipo: "aprovar" }, { ...base, valorCaso: 100 }).ok).toBe(true);
    const v = validarAcao({ tipo: "aprovar" }, { ...base, valorCaso: 100.01 });
    expect(v.ok).toBe(false);
    expect(v.precisaAprovacao).toBe(true);
  });
  it("aprovação automática até R$ 500 por dia", () => {
    expect(validarAcao({ tipo: "aprovar" }, { ...base, valorCaso: 60, somaAutomaticaHoje: 440 }).ok).toBe(true);
    expect(validarAcao({ tipo: "aprovar" }, { ...base, valorCaso: 60, somaAutomaticaHoje: 441 }).ok).toBe(false);
  });
  it("comprador suspeito nunca é aprovado sozinho", () => {
    expect(validarAcao({ tipo: "aprovar" }, { ...base, compradorSuspeito: true }).ok).toBe(false);
    expect(validarAcao({ tipo: "aprovar" }, { ...base, compradorSuspeito: true, modo: "aprovado" }).ok).toBe(true);
  });
  it("recusa, disputa e oferta sempre pedem aprovação", () => {
    for (const tipo of ["recusar", "disputar", "oferecer_parcial", "desistir_disputa"] as const) {
      const v = validarAcao({ tipo, motivo_plataforma: 1, valor_parcial: 10 }, base);
      expect(v.ok).toBe(false);
      expect(v.precisaAprovacao).toBe(true);
    }
    expect(validarAcao({ tipo: "recusar", motivo_plataforma: 1 }, { ...base, modo: "aprovado" }).ok).toBe(true);
  });
  it("motivo oficial obrigatório na recusa/disputa; valor parcial dentro do reembolso", () => {
    expect(validarAcao({ tipo: "disputar" }, { ...base, modo: "aprovado" }).ok).toBe(false);
    expect(validarAcao({ tipo: "oferecer_parcial", valor_parcial: 60 }, { ...base, modo: "aprovado" }).ok).toBe(false);
    expect(validarAcao({ tipo: "oferecer_parcial", valor_parcial: 24 }, { ...base, modo: "aprovado" }).ok).toBe(true);
  });
  it("modo sugestão nunca envia", () => {
    expect(validarAcao({ tipo: "aprovar" }, { ...base, modo: "sugerir" }).ok).toBe(false);
  });
  it("aguardar sempre pode", () => {
    expect(validarAcao({ tipo: "aguardar" }, { ...base, flagLigada: false }).ok).toBe(true);
  });
  it("prazo crítico em menos de 4 h", () => {
    const agora = new Date("2026-11-11T12:00:00Z");
    expect(prazoCritico(new Date("2026-11-11T15:30:00Z"), 4, agora)).toBe(true);
    expect(prazoCritico(new Date("2026-11-11T17:00:00Z"), 4, agora)).toBe(false);
    expect(prazoCritico(null, 4, agora)).toBe(false);
  });
});
