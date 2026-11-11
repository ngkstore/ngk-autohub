// Cálculo de estoque (D3) — puro e testável.
export type VendasSku = { v7: number; v28: number; vAnoAnterior: number | null }; // unidades nos períodos
export type ParametrosSku = { prazoDias: number; segurancaDias: number; diasDesejados: number; caixa: number | null; fatorSazonal: number };
export type Status = "ruptura" | "critico" | "atencao" | "ok" | "excesso" | "parado" | "inativo";

/**
 * Venda média por dia: 50% da média de 7 d + 30% da média de 28 d + 20% do mesmo período do
 * ano anterior (média diária). Sem ano anterior: 60% (7 d) + 40% (28 d) × fator sazonal manual.
 */
export function vendaMediaDia(v: VendasSku, fatorSazonal = 1): number {
  const m7 = v.v7 / 7;
  const m28 = v.v28 / 28;
  if (v.vAnoAnterior !== null && v.vAnoAnterior !== undefined) {
    const mAno = v.vAnoAnterior / 28;
    return round(0.5 * m7 + 0.3 * m28 + 0.2 * mAno, 3);
  }
  return round((0.6 * m7 + 0.4 * m28) * (fatorSazonal || 1), 3);
}

export const coberturaDias = (disponivel: number, vendaDia: number): number | null => (vendaDia > 0 ? round(disponivel / vendaDia, 1) : null);
export const pontoPedido = (vendaDia: number, prazoDias: number, segurancaDias: number): number => Math.ceil(vendaDia * (prazoDias + segurancaDias));

/** Comprar = venda média × (prazo + dias desejados) − disponível − em trânsito, arredondado para a caixa. */
export function quantidadeComprar(vendaDia: number, disponivel: number, emTransito: number, p: ParametrosSku): number {
  const bruto = vendaDia * (p.prazoDias + p.diasDesejados) - disponivel - emTransito;
  if (bruto <= 0) return 0;
  if (p.caixa && p.caixa > 1) return Math.ceil(bruto / p.caixa) * p.caixa;
  return Math.ceil(bruto);
}

/** Ruptura e crítico só valem para SKU com venda relevante (≥ 1 unidade nos últimos 30 dias). Estoque zero sem venda = "inativo" (fora dos indicadores). */
export function statusSku(disponivel: number, vendaDia: number, v30: number, prazoDias: number, segurancaDias: number): Status {
  const vendeRelevante = v30 >= 1;
  if (disponivel <= 0) return vendeRelevante ? "ruptura" : "inativo";
  if (!vendeRelevante && vendaDia <= 0) return "parado";
  const cob = coberturaDias(disponivel, vendaDia);
  if (cob === null) return "parado";
  if (cob < prazoDias) return "critico";
  if (disponivel < pontoPedido(vendaDia, prazoDias, segurancaDias)) return "atencao";
  if (cob > 90) return "excesso";
  return "ok";
}

/** Disponível de um kit = menor(disponível do componente ÷ quantidade). */
export function disponivelKit(componentes: { disponivel: number; quantidade: number }[]): number {
  if (componentes.length === 0) return 0;
  return Math.floor(Math.min(...componentes.map((c) => (c.quantidade > 0 ? c.disponivel / c.quantidade : Infinity))));
}

/** Venda perdida estimada = venda média × dias sem estoque até a reposição × preço médio. */
export function vendaPerdida(vendaDia: number, disponivel: number, prazoDias: number, precoMedio: number): number {
  const cob = vendaDia > 0 ? disponivel / vendaDia : Infinity;
  const diasSem = Math.max(0, prazoDias - cob);
  return round(vendaDia * diasSem * precoMedio, 2);
}

/** Data estimada em que o estoque acaba. */
export function acabaEm(disponivel: number, vendaDia: number, hoje = new Date()): Date | null {
  if (vendaDia <= 0) return null;
  return new Date(hoje.getTime() + (disponivel / vendaDia) * 86400000);
}

export function fatorDoPeriodo(fatores: { inicio: string; fim: string; fator: number }[], hoje = new Date()): number {
  const d = hoje.toISOString().slice(0, 10);
  const f = fatores.find((x) => x.inicio <= d && d <= x.fim);
  return f ? Number(f.fator) || 1 : 1;
}

const round = (v: number, casas: number) => Math.round(v * 10 ** casas) / 10 ** casas;
