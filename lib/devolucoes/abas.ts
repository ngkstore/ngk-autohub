// Abas da fila de devoluções → etapas / condições. Módulo PURO (sem servidor; testável).
export type CasoParaAba = { etapa: string; prazo_prova: string | null; disputa_status: string | null; compensacao_status: string | null };

// disputa de verdade: prova do vendedor ou compensação em andamento (NOT_NEEDED / NOT_REQUIRED não contam)
const SEM_DISPUTA = new Set(["", "NOT_NEEDED", "NOT_REQUIRED", "NONE"]);
export const emDisputa = (d: CasoParaAba) => !SEM_DISPUTA.has(String(d.disputa_status || "").toUpperCase()) || !SEM_DISPUTA.has(String(d.compensacao_status || "").toUpperCase());

export const ABAS_FILA: { id: string; nome: string; etapas?: string[]; filtro?: (d: CasoParaAba) => boolean }[] = [
  { id: "responder", nome: "Responder", etapas: ["resposta", "solicitado"] },
  { id: "prova", nome: "Enviar prova", filtro: (d) => d.etapa !== "encerrado" && !!d.prazo_prova && new Date(d.prazo_prova) > new Date() },
  { id: "transito", nome: "Em trânsito", etapas: ["voltando"] },
  { id: "coleta", nome: "Agendar coleta", etapas: ["coleta"] },
  { id: "inspecionar", nome: "Validar / inspecionar", etapas: ["recebido", "validar", "inspecao"] },
  { id: "disputa", nome: "Em disputa", filtro: (d) => d.etapa === "decisao" && emDisputa(d) },
  { id: "plataforma", nome: "Aguardando plataforma", filtro: (d) => d.etapa === "decisao" && !emDisputa(d) },
  { id: "encerradas", nome: "Encerradas", etapas: ["encerrado"] },
];

export const casoNaAba = (abaId: string, d: CasoParaAba): boolean => {
  const aba = ABAS_FILA.find((a) => a.id === abaId);
  if (!aba) return false;
  return aba.etapas ? aba.etapas.includes(d.etapa) : !!aba.filtro?.(d);
};
