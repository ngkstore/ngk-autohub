// Tipos do módulo de Devoluções (Parte B). Linha de `devolucoes` como o servidor grava.
export type Canal = "shopee" | "tiktok";
// coleta = agendar coleta reversa (Shopee LOGISTICS_PENDING_ARRANGE); validar = "Validar item" / "Analisar reembolso aprovado pela Shopee"
export type Etapa = "solicitado" | "resposta" | "voltando" | "coleta" | "recebido" | "validar" | "inspecao" | "decisao" | "encerrado";
export type TipoDevolucao = "devolucao_reembolso" | "so_reembolso" | "troca" | "cancelamento";
export type Resultado = "aprovada" | "recusada" | "parcial" | "ganha" | "perdida" | "cancelada_comprador" | "vencida";

export type ItemDevolucao = { sku: string | null; variacao?: string | null; nome: string | null; quantidade: number; valor: number | null; imagem?: string | null };

export type DevolucaoLinha = {
  loja_id: string;
  canal: Canal;
  plataforma_id: string;
  pedido_id: string;
  tipo: TipoDevolucao;
  status_plataforma: string | null;
  etapa: Etapa;
  motivo_codigo: string | null;
  motivo_texto: string | null;
  texto_comprador: string | null;
  valor_pedido: number | null;
  valor_reembolso_pedido: number | null;
  valor_reembolsado: number | null;
  prazo_resposta: string | null;
  prazo_prova: string | null;
  prazo_contestar: string | null;
  prazo_oferta: string | null;
  rastreio_reverso: string | null;
  transportadora_reversa: string | null;
  chegou_em: string | null;
  comprador_id: string | null;
  comprador_usuario: string | null;
  disputa_status: string | null;
  compensacao_status: string | null;
  resultado: Resultado | null;
  itens: ItemDevolucao[];
  bruto: Record<string, unknown>;
  plataforma_criado_em: string | null;
  plataforma_atualizado_em: string | null;
};

export type MidiaComprador = { tipo: "foto" | "video"; url: string; thumb?: string | null; legenda?: string | null };

export type EventoLinha = {
  quando: string;
  origem: "plataforma" | "comprador" | "vendedor" | "assistente" | "sistema" | "equipe";
  tipo: string;
  descricao: string | null;
  dados?: Record<string, unknown> | null;
  chave: string; // idempotência por devolução
};

export const isoDeUnix = (s: unknown): string | null => {
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? new Date(n * 1000).toISOString() : null;
};
export const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
