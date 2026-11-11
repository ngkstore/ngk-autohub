import { supabase } from "@/lib/supabase";
import type { Pendencia } from "@/lib/devolucoes/pendencias";
import { urgencia } from "@/lib/devolucoes/pendencias";

// F3 — pendências de campanhas para o Painel: prazos de inscrição em 3 dias, campanha
// começando amanhã e itens com margem negativa no preço da campanha.
export async function pendenciasCampanhas(lojaIds: string[] | null): Promise<Pendencia[]> {
  const agora = Date.now();
  const em3d = new Date(agora + 3 * 86400000).toISOString();
  const em2d = new Date(agora + 2 * 86400000).toISOString();
  let q = supabase.from("campanhas").select("id, canal, loja_id, nome, tipo, inicio, fim, prazo_inscricao").or(`prazo_inscricao.lte.${em3d},inicio.lte.${em2d}`).or(`fim.gte.${new Date(agora).toISOString()},fim.is.null`).limit(200);
  if (lojaIds) q = q.or(`loja_id.in.(${lojaIds.join(",")}),loja_id.is.null`);
  const { data } = await q;
  const saida: Pendencia[] = [];
  const ids: string[] = [];
  for (const c of data || []) {
    ids.push(c.id);
    const canal = c.canal === "tiktok" ? "tiktok" : "shopee";
    if (c.prazo_inscricao && new Date(c.prazo_inscricao).getTime() >= agora - 86400000 && c.prazo_inscricao <= em3d) {
      saida.push({ prazo: c.prazo_inscricao, urgencia: urgencia(c.prazo_inscricao), canal, loja_id: c.loja_id ?? "", titulo: `Inscrição ${c.nome} encerra`, detalhe: "confira os itens inscritos e a margem no preço da campanha", link: `/campanhas?campanha=${c.id}`, acao: "Revisar itens" });
    }
    if (c.inicio && new Date(c.inicio).getTime() > agora && c.inicio <= em2d) {
      saida.push({ prazo: c.inicio, urgencia: urgencia(c.inicio), canal, loja_id: c.loja_id ?? "", titulo: `${c.nome} começa ${urgencia(c.inicio) === "hoje" ? "hoje" : "amanhã"}`, detalhe: `${c.tipo} · ${c.canal}`, link: `/campanhas?campanha=${c.id}`, acao: "Ver campanha" });
    }
  }
  if (ids.length) {
    const { data: neg } = await supabase.from("campanha_itens").select("campanha_id, nome, margem, margem_pct").in("campanha_id", ids).lt("margem", 0).limit(200);
    const porCampanha = new Map<string, { n: number; ex: string[] }>();
    for (const i of neg || []) {
      const g = porCampanha.get(i.campanha_id) || { n: 0, ex: [] };
      g.n++;
      if (g.ex.length < 3) g.ex.push(i.nome ?? "?");
      porCampanha.set(i.campanha_id, g);
    }
    for (const [cid, g] of porCampanha) {
      const c = (data || []).find((x) => x.id === cid)!;
      // promoção já em andamento (ou sem prazo): só avisa, sem entrar na fila com prazo
      const futura = !!c.inicio && new Date(c.inicio).getTime() > agora;
      saida.push({ prazo: futura ? c.inicio : null, urgencia: futura ? urgencia(c.inicio ?? null) : "depois", canal: c.canal === "tiktok" ? "tiktok" : "shopee", loja_id: c.loja_id ?? "", titulo: `${g.n} item(ns) com margem negativa em ${c.nome}`, detalhe: g.ex.join(", "), link: `/campanhas?campanha=${cid}`, acao: "Revisar itens", grupo: futura ? undefined : ("aviso" as const) });
    }
  }
  return saida;
}
