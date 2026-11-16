import { supabase } from "@/lib/supabase";
import { getFlagConta } from "@/lib/flags";
import { CONFIG_PADRAO, type CreatorsConfig } from "@/lib/creators/calculo";

export const FLAG_CREATORS_ACOES = "creators_acoes_api"; // fase 2: DESLIGADA até o Gabriel ligar

export async function creatorsConfig(contaId: string | null): Promise<CreatorsConfig> {
  if (!contaId) return { ...CONFIG_PADRAO };
  const { data } = await supabase.from("creators_config").select("*").eq("conta_id", contaId).maybeSingle();
  if (!data) return { ...CONFIG_PADRAO };
  const cfg = { ...CONFIG_PADRAO };
  for (const k of Object.keys(CONFIG_PADRAO) as (keyof CreatorsConfig)[]) {
    const v = Number((data as Record<string, unknown>)[k]);
    if (Number.isFinite(v) && v >= 0) cfg[k] = v;
  }
  return cfg;
}

export async function salvarCreatorsConfig(contaId: string, parcial: Partial<CreatorsConfig>) {
  const linha: Record<string, unknown> = { conta_id: contaId, atualizado_em: new Date().toISOString() };
  for (const k of Object.keys(CONFIG_PADRAO) as (keyof CreatorsConfig)[]) {
    const v = Number(parcial[k]);
    if (parcial[k] !== undefined && Number.isFinite(v) && v >= 0) linha[k] = v;
  }
  await supabase.from("creators_config").upsert(linha, { onConflict: "conta_id" });
}

export const creatorsAcoesLigadas = (contaId: string) => getFlagConta(FLAG_CREATORS_ACOES, contaId);
