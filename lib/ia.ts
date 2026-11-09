// Modelo de IA do atendimento (chat Shopee/TikTok e respostas de avaliações),
// numa constante única (O3 do plano de melhorias 09/11/2026).
//
// Trocado para claude-haiku-5-5 em 09/11/2026 com aprovação do Gabriel: US$ 0,10 de
// entrada e 0,50 de saída por 1M de tokens, contra 1,00 / 5,00 do Haiku 4.5 (preços em
// lib/uso.ts). Para voltar sem deploy: MODELO_IA=claude-haiku-4-5 nas variáveis da Vercel.
//
// Haiku 5.5 pensa por padrão (thinking adaptativo); os tokens de raciocínio contam no
// max_tokens e são cobrados como saída. Para respostas curtas de atendimento usamos
// esforço baixo e um max_tokens com folga. `budget_tokens` e temperature retornam 400
// nesse modelo — não usar.
export const MODELO_IA = process.env.MODELO_IA || "claude-haiku-5-5";
export const ESFORCO_IA = "low" as const;
