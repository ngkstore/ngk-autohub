import { describe, expect, it } from "vitest";
import { brl, pct, numero, compacto, prazoRelativo, urgenciaDoPrazo } from "@/lib/formato";

const agora = new Date("2026-11-11T12:00:00-03:00");
const mais = (min: number) => new Date(agora.getTime() + min * 60000);

describe("formatadores pt-BR", () => {
  it("brl", () => {
    expect(brl(1234.5)).toBe("R$ 1.234,50");
    expect(brl(0)).toBe("R$ 0,00");
    expect(brl("12.3", 0)).toBe("R$ 12");
    expect(brl(null)).toBe("R$ 0,00");
  });
  it("pct e numero", () => {
    expect(pct(12.345)).toBe("12,3%");
    expect(pct(-4, 0)).toBe("-4%");
    expect(numero(1234567)).toBe("1.234.567");
    expect(numero(1.5, 2)).toBe("1,50");
  });
  it("compacto", () => {
    expect(compacto(999)).toBe("999");
    expect(compacto(12_345)).toBe("12,3 mil");
    expect(compacto(4_000_000)).toBe("4,0 mi");
  });
});

describe("prazoRelativo", () => {
  it("futuro", () => {
    expect(prazoRelativo(mais(80), agora)).toBe("em 1h 20");
    expect(prazoRelativo(mais(30), agora)).toBe("em 30 min");
    expect(prazoRelativo(mais(3 * 24 * 60), agora)).toBe("em 3 d");
  });
  it("vencido e agora", () => {
    expect(prazoRelativo(mais(-120), agora)).toBe("vencida 2h");
    expect(prazoRelativo(mais(0), agora)).toBe("agora");
    expect(prazoRelativo(null, agora)).toBe("");
  });
});

describe("urgenciaDoPrazo (vermelho até 4 h ou vencido, laranja hoje, amarelo amanhã, cinza depois)", () => {
  it("agora", () => {
    expect(urgenciaDoPrazo(mais(-10), agora)).toBe("agora");
    expect(urgenciaDoPrazo(mais(4 * 60), agora)).toBe("agora");
  });
  it("hoje", () => expect(urgenciaDoPrazo(mais(6 * 60), agora)).toBe("hoje"));
  it("amanhã", () => expect(urgenciaDoPrazo(mais(20 * 60), agora)).toBe("amanha"));
  it("depois", () => {
    expect(urgenciaDoPrazo(mais(3 * 24 * 60), agora)).toBe("depois");
    expect(urgenciaDoPrazo(undefined, agora)).toBe("depois");
  });
});
