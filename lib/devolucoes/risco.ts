import { supabase } from "@/lib/supabase";

// compradores_risco (B4): conta as devoluções dos últimos 90 dias por comprador e
// marca `suspeito` a partir do limite da conta (padrão 3). Só id/usuário da plataforma.
export async function atualizarRiscoCompradores(limiteSuspeito = 3): Promise<{ compradores: number; suspeitos: number }> {
  const desde = new Date(Date.now() - 90 * 86400000).toISOString();
  const { data } = await supabase
    .from("devolucoes")
    .select("canal, comprador_id, plataforma_criado_em")
    .not("comprador_id", "is", null)
    .gte("plataforma_criado_em", desde)
    .neq("tipo", "cancelamento");
  const contagem = new Map<string, { canal: string; comprador_id: string; n: number }>();
  for (const d of data || []) {
    const k = `${d.canal}|${d.comprador_id}`;
    const c = contagem.get(k) || { canal: d.canal, comprador_id: String(d.comprador_id), n: 0 };
    c.n++;
    contagem.set(k, c);
  }
  const linhas = [...contagem.values()].map((c) => ({
    canal: c.canal,
    comprador_id: c.comprador_id,
    devolucoes_90d: c.n,
    suspeito: c.n >= limiteSuspeito,
    motivo: c.n >= limiteSuspeito ? `${c.n} devoluções em 90 dias` : null,
    atualizado_em: new Date().toISOString(),
  }));
  for (let i = 0; i < linhas.length; i += 500) await supabase.from("compradores_risco").upsert(linhas.slice(i, i + 500), { onConflict: "canal,comprador_id" });
  return { compradores: linhas.length, suspeitos: linhas.filter((l) => l.suspeito).length };
}

export async function riscoDoComprador(canal: string, compradorId: string | null): Promise<{ devolucoes_90d: number; suspeito: boolean }> {
  if (!compradorId) return { devolucoes_90d: 0, suspeito: false };
  const { data } = await supabase.from("compradores_risco").select("devolucoes_90d, suspeito").eq("canal", canal).eq("comprador_id", compradorId).maybeSingle();
  return { devolucoes_90d: Number(data?.devolucoes_90d || 0), suspeito: !!data?.suspeito };
}
