import { supabase } from "@/lib/supabase";

// B8 — pendências de devoluções para o menu (contador), os alertas e o Painel do dia (Parte C).
export type Pendencia = {
  prazo: string | null;
  urgencia: "agora" | "hoje" | "amanha" | "depois";
  canal: string;
  loja_id: string;
  titulo: string;
  detalhe: string;
  link: string;
  acao: string;
  grupo?: "conferir" | "aviso"; // conferir = prazo vencido há dias (status provavelmente velho); aviso = sem prazo, só informa
};

export function urgencia(prazo: string | null, agora = new Date()): Pendencia["urgencia"] {
  if (!prazo) return "depois";
  const d = new Date(prazo);
  if (d.getTime() - agora.getTime() <= 4 * 3600000) return "agora";
  const fimHoje = new Date(agora);
  fimHoje.setHours(23, 59, 59, 999);
  if (d <= fimHoje) return "hoje";
  const fimAmanha = new Date(fimHoje.getTime() + 86400000);
  return d <= fimAmanha ? "amanha" : "depois";
}

const ETAPA_ACAO: Record<string, string> = { resposta: "Responder", decisao: "Decidir", recebido: "Inspecionar", inspecao: "Concluir inspeção", voltando: "Acompanhar volta", solicitado: "Ver caso" };

export async function pendenciasDevolucoes(lojaIds: string[] | null): Promise<Pendencia[]> {
  let q = supabase
    .from("devolucoes")
    .select("id, loja_id, canal, plataforma_id, pedido_id, etapa, motivo_codigo, valor_reembolso_pedido, prazo_resposta, prazo_prova, itens, chegou_em")
    .neq("etapa", "encerrado")
    .in("etapa", ["resposta", "decisao", "recebido", "inspecao"])
    .order("prazo_resposta", { ascending: true, nullsFirst: false })
    .limit(200);
  if (lojaIds) q = q.in("loja_id", lojaIds);
  const { data } = await q;
  const limiteConferir = Date.now() - 3 * 86400000;
  return (data || []).map((d) => {
    const prazo = (d.prazo_resposta as string | null) ?? (d.prazo_prova as string | null) ?? null;
    const vencidaHaDias = !!prazo && new Date(prazo).getTime() < limiteConferir;
    const item = (Array.isArray(d.itens) ? (d.itens as { nome: string | null }[])[0]?.nome : null) || d.pedido_id;
    return {
      prazo,
      urgencia: urgencia(prazo),
      canal: d.canal,
      loja_id: d.loja_id,
      titulo: `${ETAPA_ACAO[d.etapa] ?? "Ver"} devolução · ${item}`,
      detalhe: `${d.motivo_codigo ?? "-"} · R$ ${Number(d.valor_reembolso_pedido || 0).toFixed(2)}`,
      link: `/devolucoes/${d.id}`,
      acao: vencidaHaDias ? "Conferir status" : ETAPA_ACAO[d.etapa] ?? "Ver",
      grupo: vencidaHaDias ? ("conferir" as const) : undefined,
    };
  });
}

// Contador do menu: casos que vencem em 24 h (ou já venceram) nas lojas do usuário.
export async function contadorDevolucoes(lojaIds: string[] | null): Promise<number> {
  if (lojaIds && lojaIds.length === 0) return 0;
  const limite = new Date(Date.now() + 24 * 3600000).toISOString();
  let q = supabase.from("devolucoes").select("id", { count: "exact", head: true }).in("etapa", ["resposta", "decisao", "recebido"]).lte("prazo_resposta", limite);
  if (lojaIds) q = q.in("loja_id", lojaIds);
  const { count } = await q;
  return count ?? 0;
}
