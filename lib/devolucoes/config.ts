import { supabase } from "@/lib/supabase";
import { getFlagConta, setFlagConta } from "@/lib/flags";

// Configurações do módulo de Devoluções, POR CONTA, na tabela `configuracoes`
// (chave "devolucoes_<nome>:<contaId>"). A flag `devolucoes_acoes_api` fica
// DESLIGADA até o Gabriel ligar: sem ela nada é enviado à Shopee/TikTok.
export const FLAG_ACOES_API = "devolucoes_acoes_api";

// Limites fixos no código (B4): valores padrão; só os números são editáveis.
export const LIMITES_PADRAO = {
  auto_caso_max: 100, // aprovação automática até R$ 100 por caso
  auto_dia_max: 500, // e R$ 500 por dia
  alerta_horas: 4, // prazo com menos de 4 h → alerta
  suspeito_devolucoes_90d: 3, // 3+ devoluções em 90 dias → suspeito
  credito_dias: 3, // disputa ganha sem crédito em 3 dias → alerta
};

export type ConfigDevolucoes = {
  acoes_api: boolean;
  email_disputa: string | null;
  limites: typeof LIMITES_PADRAO;
};

async function valor(chave: string): Promise<string | null> {
  const { data } = await supabase.from("configuracoes").select("valor").eq("chave", chave).maybeSingle();
  return data?.valor ?? null;
}

// E-mail que a API da Shopee exige na disputa: configurado; senão o login da loja (conta_membros admin).
export async function emailDisputa(contaId: string): Promise<string | null> {
  const cfg = await valor(`devolucoes_email_disputa:${contaId}`);
  if (cfg) return cfg;
  const { data } = await supabase.from("conta_membros").select("email").eq("conta_id", contaId).order("admin", { ascending: false }).limit(1).maybeSingle();
  return data?.email ?? null;
}

export async function configDevolucoes(contaId: string): Promise<ConfigDevolucoes> {
  const [acoes, email, lim] = await Promise.all([getFlagConta(FLAG_ACOES_API, contaId), emailDisputa(contaId), valor(`devolucoes_limites:${contaId}`)]);
  let limites = { ...LIMITES_PADRAO };
  if (lim) {
    try {
      const j = JSON.parse(lim) as Partial<typeof LIMITES_PADRAO>;
      for (const k of Object.keys(LIMITES_PADRAO) as (keyof typeof LIMITES_PADRAO)[]) {
        const n = Number(j[k]);
        if (Number.isFinite(n) && n >= 0) limites[k] = n;
      }
    } catch {
      limites = { ...LIMITES_PADRAO };
    }
  }
  return { acoes_api: acoes, email_disputa: email, limites };
}

export async function salvarConfigDevolucoes(contaId: string, c: { acoes_api?: boolean; email_disputa?: string | null; limites?: Partial<typeof LIMITES_PADRAO> }) {
  if (typeof c.acoes_api === "boolean") await setFlagConta(FLAG_ACOES_API, contaId, c.acoes_api);
  const agora = new Date().toISOString();
  if (c.email_disputa !== undefined) {
    await supabase.from("configuracoes").upsert({ chave: `devolucoes_email_disputa:${contaId}`, valor: c.email_disputa || "", atualizado_em: agora }, { onConflict: "chave" });
  }
  if (c.limites) {
    const atual = (await configDevolucoes(contaId)).limites;
    await supabase.from("configuracoes").upsert({ chave: `devolucoes_limites:${contaId}`, valor: JSON.stringify({ ...atual, ...c.limites }), atualizado_em: agora }, { onConflict: "chave" });
  }
}

// Conta dona de uma loja (para flags/limites por conta).
export async function contaDaLoja(lojaId: string): Promise<string | null> {
  const { data } = await supabase.from("lojas").select("conta_id").eq("id", lojaId).maybeSingle();
  return (data?.conta_id as string) ?? null;
}
