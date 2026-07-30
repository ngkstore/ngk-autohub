import { supabase } from "@/lib/supabase";

// Preço da Anthropic por 1 MILHÃO de tokens (USD). Fonte: tabela de preços da
// Anthropic. Atualize aqui se eles mudarem. Cache de leitura = ~0,1x do input;
// cache de escrita = ~1,25x do input (hoje o robô não usa cache, então esses
// campos vêm 0 — ficam aqui só para o cálculo continuar certo se um dia usar).
const PRECOS: Record<
  string,
  { entrada: number; saida: number; cacheLeitura: number; cacheEscrita: number }
> = {
  "claude-opus-4-8": { entrada: 5, saida: 25, cacheLeitura: 0.5, cacheEscrita: 6.25 },
  "claude-haiku-4-5": { entrada: 1, saida: 5, cacheLeitura: 0.1, cacheEscrita: 1.25 },
};

type Usage = {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
};

// Custo em USD de uma chamada, a partir do usage devolvido pela API.
export function custoUsd(modelo: string, usage: Usage): number {
  const p = PRECOS[modelo];
  if (!p) return 0;
  const MI = 1_000_000;
  const inp = (usage.input_tokens ?? 0) * p.entrada;
  const out = (usage.output_tokens ?? 0) * p.saida;
  const cr = (usage.cache_read_input_tokens ?? 0) * p.cacheLeitura;
  const cw = (usage.cache_creation_input_tokens ?? 0) * p.cacheEscrita;
  return (inp + out + cr + cw) / MI;
}

// Registra uma chamada de IA para medir o consumo por conta (base de cobrança).
// Best-effort: NUNCA lança — uma falha na medição não pode quebrar o robô.
export async function registrarUsoIA({
  lojaId,
  tipo,
  modelo,
  marketplace = "shopee",
  usage,
}: {
  lojaId: string;
  tipo: "chat" | "avaliacao";
  modelo: string;
  marketplace?: string;
  usage: Usage;
}): Promise<void> {
  try {
    await supabase.from("uso_ia").insert({
      loja_id: lojaId,
      marketplace,
      tipo,
      modelo,
      tokens_entrada: usage.input_tokens ?? 0,
      tokens_saida: usage.output_tokens ?? 0,
      tokens_cache_leitura: usage.cache_read_input_tokens ?? 0,
      tokens_cache_escrita: usage.cache_creation_input_tokens ?? 0,
      custo_usd: custoUsd(modelo, usage),
    });
  } catch {
    // ignora — a medição não pode interromper a automação
  }
}
