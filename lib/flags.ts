import { supabase } from "@/lib/supabase";

// Flags de robô são POR CONTA: chave = "<base>:<contaId>".
// Ex.: responder_chat_ativo:a0000000-...-0001

export async function getFlagConta(base: string, contaId: string): Promise<boolean> {
  const { data } = await supabase
    .from("configuracoes")
    .select("valor")
    .eq("chave", `${base}:${contaId}`)
    .maybeSingle();
  return data?.valor === "true";
}

export async function setFlagConta(base: string, contaId: string, valor: boolean) {
  const chave = `${base}:${contaId}`;
  const linha = {
    chave,
    valor: valor ? "true" : "false",
    atualizado_em: new Date().toISOString(),
  };
  const { data } = await supabase
    .from("configuracoes")
    .select("chave")
    .eq("chave", chave)
    .maybeSingle();
  if (data) {
    await supabase.from("configuracoes").update(linha).eq("chave", chave);
  } else {
    await supabase.from("configuracoes").insert(linha);
  }
}

// Map contaId -> bool de todas as contas (usado pelos crons, que veem tudo).
export async function flagsPorConta(base: string): Promise<Record<string, boolean>> {
  const { data } = await supabase
    .from("configuracoes")
    .select("chave, valor")
    .like("chave", `${base}:%`);
  const map: Record<string, boolean> = {};
  (data || []).forEach((r) => {
    const contaId = r.chave.slice(base.length + 1);
    map[contaId] = r.valor === "true";
  });
  return map;
}
