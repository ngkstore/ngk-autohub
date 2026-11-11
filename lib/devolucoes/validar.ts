// Regras FIXAS do módulo de Devoluções (B3/B4), puras e testáveis:
//  - recusa, disputa e oferta SEMPRE pedem aprovação humana;
//  - aprovação automática só até R$ X por caso e R$ Y por dia (valores em Configurações);
//  - comprador suspeito nunca é aprovado sozinho;
//  - nada é enviado à plataforma com a flag `devolucoes_acoes_api` desligada.
import type { LIMITES_PADRAO } from "@/lib/devolucoes/config";

export type AcaoTipo = "aprovar" | "recusar" | "disputar" | "oferecer_parcial" | "aceitar_contraproposta" | "enviar_provas" | "desistir_disputa" | "rastreio_volta" | "aguardar";

export type Acao = {
  tipo: AcaoTipo;
  motivo_plataforma?: string | number | null; // da lista oficial (nunca digitado)
  texto?: string | null;
  valor_parcial?: number | null;
  imagens?: string[]; // storage_path ou url
  rastreio?: { transportadora: string; codigo: string } | null;
};

export type ContextoValidacao = {
  flagLigada: boolean;
  valorCaso: number; // reembolso em jogo
  somaAutomaticaHoje: number; // já aprovado automaticamente hoje (R$)
  compradorSuspeito: boolean;
  limites: typeof LIMITES_PADRAO;
  modo: "automatico" | "aprovado" | "sugerir"; // automatico = regra sem humano; aprovado = humano aprovou
};

export type Validacao = { ok: boolean; precisaAprovacao: boolean; motivo?: string };

export const ACOES_SEMPRE_COM_APROVACAO: AcaoTipo[] = ["recusar", "disputar", "oferecer_parcial", "desistir_disputa"];

export function validarAcao(acao: Acao, ctx: ContextoValidacao): Validacao {
  if (acao.tipo === "aguardar") return { ok: true, precisaAprovacao: false };
  if (!ctx.flagLigada) return { ok: false, precisaAprovacao: true, motivo: "Ações pela API desligadas (flag devolucoes_acoes_api). Faça pelo Seller Center." };
  if (ctx.modo === "sugerir") return { ok: false, precisaAprovacao: true, motivo: "Modo sugestão: nada é enviado sem aprovação." };

  if (ACOES_SEMPRE_COM_APROVACAO.includes(acao.tipo)) {
    if (ctx.modo !== "aprovado") return { ok: false, precisaAprovacao: true, motivo: `${acao.tipo} sempre pede aprovação.` };
    if ((acao.tipo === "recusar" || acao.tipo === "disputar") && (acao.motivo_plataforma === null || acao.motivo_plataforma === undefined || acao.motivo_plataforma === "")) {
      return { ok: false, precisaAprovacao: true, motivo: "Escolha o motivo da lista oficial da plataforma." };
    }
    if (acao.tipo === "oferecer_parcial" && !(Number(acao.valor_parcial) > 0 && Number(acao.valor_parcial) < ctx.valorCaso)) {
      return { ok: false, precisaAprovacao: true, motivo: "Valor parcial tem de ser maior que zero e menor que o reembolso pedido." };
    }
    return { ok: true, precisaAprovacao: false };
  }

  if (acao.tipo === "aprovar") {
    if (ctx.modo === "aprovado") return { ok: true, precisaAprovacao: false };
    // automático: limites e comprador
    if (ctx.compradorSuspeito) return { ok: false, precisaAprovacao: true, motivo: "Comprador marcado como suspeito: não aprova sozinho." };
    if (ctx.valorCaso > ctx.limites.auto_caso_max) return { ok: false, precisaAprovacao: true, motivo: `Acima de R$ ${ctx.limites.auto_caso_max} por caso.` };
    if (ctx.somaAutomaticaHoje + ctx.valorCaso > ctx.limites.auto_dia_max) return { ok: false, precisaAprovacao: true, motivo: `Passaria de R$ ${ctx.limites.auto_dia_max} aprovados automaticamente hoje.` };
    return { ok: true, precisaAprovacao: false };
  }

  // aceitar_contraproposta, enviar_provas, rastreio_volta: com humano ou regra automática dentro da flag
  if (acao.tipo === "rastreio_volta" && !(acao.rastreio?.codigo && acao.rastreio?.transportadora)) {
    return { ok: false, precisaAprovacao: true, motivo: "Informe transportadora e código de rastreio." };
  }
  if (acao.tipo === "enviar_provas" && !(acao.imagens && acao.imagens.length > 0)) {
    return { ok: false, precisaAprovacao: true, motivo: "Escolha ao menos uma imagem (quadro ou foto)." };
  }
  return { ok: true, precisaAprovacao: ctx.modo !== "aprovado" && acao.tipo === "aceitar_contraproposta" };
}

// Urgência de um caso para alertas: prazo em menos de N horas.
export function prazoCritico(prazo: string | Date | null | undefined, horas: number, agora = new Date()): boolean {
  if (!prazo) return false;
  const d = typeof prazo === "string" ? new Date(prazo) : prazo;
  return d.getTime() - agora.getTime() <= horas * 3600 * 1000;
}
