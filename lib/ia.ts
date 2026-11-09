// Modelo de IA do atendimento (chat Shopee/TikTok e respostas de avaliações),
// numa constante única (O3 do plano de melhorias 09/11/2026).
//
// Troca de modelo: definir MODELO_IA nas variáveis de ambiente (Vercel) OU mudar o
// padrão aqui. O padrão continua claude-haiku-4-5 até o Gabriel aprovar a troca para
// claude-haiku-5-5 depois de uns dias em modo sugestão (aprovação pelo Telegram).
// Observação: no claude-haiku-5-5 o thinking adaptativo vem ligado por padrão e
// `budget_tokens` retorna 400 — ao migrar, revisar os parâmetros das chamadas.
export const MODELO_IA = process.env.MODELO_IA || "claude-haiku-4-5";
