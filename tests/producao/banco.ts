// Acesso ao banco para os testes de conferência "tela × banco".
// Carrega .env.local pelo @next/env (mesmo mecanismo do Next); nunca imprime variáveis.
import { loadEnvConfig } from "@next/env";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

loadEnvConfig(process.cwd(), true, { info: () => {}, error: () => {} });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const temBanco = () => Boolean(url && chave);

let cliente: SupabaseClient | null = null;
export function banco(): SupabaseClient {
  if (!cliente) cliente = createClient(url as string, chave as string, { auth: { persistSession: false } });
  return cliente;
}

export async function rpc<T>(nome: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await banco().rpc(nome, args);
  if (error) throw new Error(`${nome}: ${error.message}`);
  return data as T;
}

export async function lojasAtivas(): Promise<{ id: string; apelido: string; marketplace: string }[]> {
  const { data, error } = await banco().from("lojas").select("id, apelido, marketplace").in("status", ["ativo", "ativa"]);
  if (error) throw new Error(error.message);
  return (data || []) as { id: string; apelido: string; marketplace: string }[];
}

/** Janela fechada de N dias terminando ONTEM (BRT), em ISO — evita o dia corrente, que ainda muda. */
export function janelaFechada(dias: number): { inicio: string; fim: string } {
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const fimMs = new Date(`${hoje}T00:00:00-03:00`).getTime();
  return { inicio: new Date(fimMs - dias * 86400000).toISOString(), fim: new Date(fimMs).toISOString() };
}

/** |a − b| dentro de `pct` relativo OU de `abs` absoluto. */
export function perto(a: number, b: number, pct: number, abs: number): boolean {
  const dif = Math.abs(a - b);
  return dif <= abs || dif <= Math.abs(b) * pct;
}
