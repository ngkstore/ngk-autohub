// Motor de regras do módulo de Devoluções (B4) — PURO e testável.
// Regras em ordem; vale a PRIMEIRA que bater. Cada regra tem `condicao` e `acao` (jsonb)
// e um `modo`: sugerir (só mostra), aprovar (pede aprovação) ou automatico (executa
// dentro dos limites fixos de validar.ts).
import type { AcaoTipo } from "@/lib/devolucoes/validar";

export type Condicao = {
  motivo_in?: string[]; // códigos de motivo (prefixo basta: "FUNCTIONAL" casa FUNCTIONAL_DMG)
  motivo_not_in?: string[];
  valor_max?: number; // reembolso pedido ≤
  valor_min?: number;
  etapa_in?: string[];
  canal?: "shopee" | "tiktok";
  tipo_in?: string[];
  lacrado?: boolean; // produto lacrado (inspeção/foto) — true exige evidência
  chegou?: boolean; // pacote chegou ao armazém
  peso_abaixo_pct?: number; // peso na volta ≥ X% abaixo do envio
  item_diferente?: boolean; // inspeção: diferente ou faltando
  nao_recebido_com_entrega?: boolean; // motivo "não recebido" + entrega confirmada com foto
  prazo_horas_max?: number; // prazo de resposta em menos de N horas
  suspeito?: boolean; // comprador suspeito
  devolucoes_90d_min?: number; // comprador com N+ devoluções em 90 dias
  disputa_ganha_sem_credito_dias?: number; // ganha há N+ dias sem crédito
};

export type AcaoRegra = {
  tipo: AcaoTipo | "alerta" | "tarefa_inspecao" | "marcar_suspeito" | "cobrar_credito";
  valor_parcial_pct?: number; // oferta: % do reembolso
  mensagem?: string;
  motivo_plataforma?: string | number;
  provas?: ("quadros_abertura" | "peso" | "comprovante_entrega")[];
};

export type Regra = { id: string; ordem: number; ativa: boolean; nome: string; condicao: Condicao; acao: AcaoRegra; modo: "sugerir" | "aprovar" | "automatico" };

export type ContextoCaso = {
  canal: "shopee" | "tiktok";
  tipo: string;
  etapa: string;
  motivo: string | null;
  valor: number; // reembolso pedido
  prazoResposta: string | null;
  chegou: boolean;
  lacrado: boolean | null; // null = não inspecionado
  pesoEnvioKg: number | null;
  pesoChegadaKg: number | null;
  itemDiferente: boolean | null;
  entregaConfirmadaComFoto: boolean;
  suspeito: boolean;
  devolucoes90d: number;
  disputaGanhaEm: string | null;
  creditoStatus: string | null;
  agora?: Date;
};

const temPrefixo = (motivo: string | null, lista: string[]) => !!motivo && lista.some((p) => motivo.toUpperCase().startsWith(p.toUpperCase()));

export function casa(c: Condicao, ctx: ContextoCaso): boolean {
  const agora = ctx.agora ?? new Date();
  if (c.canal && c.canal !== ctx.canal) return false;
  if (c.tipo_in && !c.tipo_in.includes(ctx.tipo)) return false;
  if (c.etapa_in && !c.etapa_in.includes(ctx.etapa)) return false;
  if (c.motivo_in && !temPrefixo(ctx.motivo, c.motivo_in)) return false;
  if (c.motivo_not_in && temPrefixo(ctx.motivo, c.motivo_not_in)) return false;
  if (c.valor_max !== undefined && !(ctx.valor <= c.valor_max)) return false;
  if (c.valor_min !== undefined && !(ctx.valor >= c.valor_min)) return false;
  if (c.lacrado !== undefined && ctx.lacrado !== c.lacrado) return false;
  if (c.chegou !== undefined && ctx.chegou !== c.chegou) return false;
  if (c.peso_abaixo_pct !== undefined) {
    if (ctx.pesoEnvioKg === null || ctx.pesoChegadaKg === null || ctx.pesoEnvioKg <= 0) return false;
    const queda = ((ctx.pesoEnvioKg - ctx.pesoChegadaKg) / ctx.pesoEnvioKg) * 100;
    if (!(queda >= c.peso_abaixo_pct)) return false;
  }
  if (c.item_diferente !== undefined && ctx.itemDiferente !== c.item_diferente) return false;
  if (c.nao_recebido_com_entrega) {
    if (!temPrefixo(ctx.motivo, ["NOT_RECEIVED", "NON_RECEIPT", "ecom_order_not_received", "PARCEL_NOT_RECEIVED", "NOT_RECEIVE"]) || !ctx.entregaConfirmadaComFoto) return false;
  }
  if (c.prazo_horas_max !== undefined) {
    if (!ctx.prazoResposta) return false;
    const h = (new Date(ctx.prazoResposta).getTime() - agora.getTime()) / 3600000;
    if (!(h < c.prazo_horas_max)) return false;
  }
  if (c.suspeito !== undefined && ctx.suspeito !== c.suspeito) return false;
  if (c.devolucoes_90d_min !== undefined && !(ctx.devolucoes90d >= c.devolucoes_90d_min)) return false;
  if (c.disputa_ganha_sem_credito_dias !== undefined) {
    if (!ctx.disputaGanhaEm || ctx.creditoStatus === "creditado") return false;
    const dias = (agora.getTime() - new Date(ctx.disputaGanhaEm).getTime()) / 86400000;
    if (!(dias >= c.disputa_ganha_sem_credito_dias)) return false;
  }
  return true;
}

// Primeira regra ATIVA que casa (ou null).
export function avaliarRegras(regras: Regra[], ctx: ContextoCaso): Regra | null {
  const ordenadas = [...regras].filter((r) => r.ativa).sort((a, b) => a.ordem - b.ordem);
  for (const r of ordenadas) if (casa(r.condicao, ctx)) return r;
  return null;
}

// Regras iniciais do plano (criadas DESLIGADAS; o Gabriel liga uma a uma).
export const REGRAS_INICIAIS: Omit<Regra, "id">[] = [
  { ordem: 10, ativa: false, nome: "Arrependimento até R$ 60 com produto lacrado → aprovar", condicao: { motivo_in: ["CHANGE_OF_MIND", "NO_LONGER_NEED", "ecom_order_delivered_refund_and_return_reason_change_mind", "DONT_WANT", "WRONG_ITEM_ORDERED"], valor_max: 60, lacrado: true }, acao: { tipo: "aprovar" }, modo: "automatico" },
  { ordem: 20, ativa: false, nome: "Na volta veio outro item ou peso 20% abaixo → disputar com quadros e peso", condicao: { chegou: true, item_diferente: true }, acao: { tipo: "disputar", provas: ["quadros_abertura", "peso"] }, modo: "aprovar" },
  { ordem: 21, ativa: false, nome: "Peso na volta 20% abaixo do envio → disputar", condicao: { chegou: true, peso_abaixo_pct: 20 }, acao: { tipo: "disputar", provas: ["quadros_abertura", "peso"] }, modo: "aprovar" },
  { ordem: 30, ativa: false, nome: "'Não recebido' com entrega confirmada e foto → disputar com comprovante", condicao: { nao_recebido_com_entrega: true }, acao: { tipo: "disputar", provas: ["comprovante_entrega"] }, modo: "aprovar" },
  { ordem: 40, ativa: false, nome: "Defeito em produto até R$ 40 → oferecer 40% sem devolução", condicao: { motivo_in: ["FUNCTIONAL", "DAMAGE", "DEFECT", "ecom_order_delivered_refund_and_return_reason_damaged", "ecom_order_delivered_refund_and_return_reason_defective"], valor_max: 40 }, acao: { tipo: "oferecer_parcial", valor_parcial_pct: 40 }, modo: "aprovar" },
  { ordem: 50, ativa: false, nome: "Prazo com menos de 4 h → alerta no Telegram", condicao: { prazo_horas_max: 4, etapa_in: ["resposta", "decisao", "recebido", "validar", "coleta"] }, acao: { tipo: "alerta" }, modo: "automatico" },
  { ordem: 60, ativa: false, nome: "Pacote chegou ao armazém → tarefa de inspeção em até 24 h", condicao: { chegou: true, etapa_in: ["voltando", "recebido", "validar"] }, acao: { tipo: "tarefa_inspecao" }, modo: "automatico" },
  { ordem: 70, ativa: false, nome: "Comprador com 3+ devoluções em 90 dias → marcar suspeito", condicao: { devolucoes_90d_min: 3 }, acao: { tipo: "marcar_suspeito" }, modo: "automatico" },
  { ordem: 80, ativa: false, nome: "Disputa ganha sem crédito em 3 dias → alerta e texto de cobrança", condicao: { disputa_ganha_sem_credito_dias: 3 }, acao: { tipo: "cobrar_credito" }, modo: "automatico" },
];
