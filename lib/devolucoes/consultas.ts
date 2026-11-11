import { supabase } from "@/lib/supabase";
import { urlAssinada } from "@/lib/devolucoes/midias";
import type { Sugestao } from "@/lib/devolucoes/assistente";
import type { ItemDevolucao } from "@/lib/devolucoes/tipos";

// Consultas das telas de Devoluções (servidor). Sempre filtradas pelas lojas do escopo.
export type DevolucaoResumo = {
  id: string;
  loja_id: string;
  canal: "shopee" | "tiktok";
  plataforma_id: string;
  pedido_id: string;
  tipo: string;
  etapa: string;
  status_plataforma: string | null;
  motivo_codigo: string | null;
  motivo_texto: string | null;
  texto_comprador: string | null;
  valor_pedido: number | null;
  valor_reembolso_pedido: number | null;
  valor_reembolsado: number | null;
  prazo_resposta: string | null;
  prazo_prova: string | null;
  prazo_contestar: string | null;
  rastreio_reverso: string | null;
  transportadora_reversa: string | null;
  chegou_em: string | null;
  comprador_usuario: string | null;
  comprador_id: string | null;
  sugestao: Sugestao | null;
  regra_id: string | null;
  disputa_status: string | null;
  compensacao_status: string | null;
  valor_recuperado: number | null;
  credito_status: string | null;
  credito_esperado_ate: string | null;
  creditado_em: string | null;
  resultado: string | null;
  itens: ItemDevolucao[] | null;
  plataforma_criado_em: string | null;
  plataforma_atualizado_em: string | null;
  atualizado_em: string;
  lojas?: { apelido: string } | null;
};

const CAMPOS = "id, loja_id, canal, plataforma_id, pedido_id, tipo, etapa, status_plataforma, motivo_codigo, motivo_texto, texto_comprador, valor_pedido, valor_reembolso_pedido, valor_reembolsado, prazo_resposta, prazo_prova, prazo_contestar, rastreio_reverso, transportadora_reversa, chegou_em, comprador_usuario, comprador_id, sugestao, regra_id, disputa_status, compensacao_status, valor_recuperado, credito_status, credito_esperado_ate, creditado_em, resultado, itens, plataforma_criado_em, plataforma_atualizado_em, atualizado_em, lojas(apelido)";

// Abas da fila → etapas / condições.
export const ABAS_FILA: { id: string; nome: string; etapas?: string[]; filtro?: (d: DevolucaoResumo) => boolean }[] = [
  { id: "responder", nome: "Responder", etapas: ["resposta", "solicitado"] },
  { id: "prova", nome: "Enviar prova", filtro: (d) => d.etapa !== "encerrado" && !!d.prazo_prova && new Date(d.prazo_prova) > new Date() },
  { id: "transito", nome: "Em trânsito", etapas: ["voltando"] },
  { id: "inspecionar", nome: "Inspecionar", etapas: ["recebido", "inspecao"] },
  { id: "disputa", nome: "Em disputa", filtro: (d) => d.etapa === "decisao" && !!(d.disputa_status || d.compensacao_status) },
  { id: "plataforma", nome: "Aguardando plataforma", filtro: (d) => d.etapa === "decisao" && !(d.disputa_status || d.compensacao_status) },
  { id: "encerradas", nome: "Encerradas", etapas: ["encerrado"] },
];

export async function listarDevolucoes(lojaIds: string[] | null, opts: { encerradas?: boolean; limite?: number } = {}): Promise<DevolucaoResumo[]> {
  let q = supabase.from("devolucoes").select(CAMPOS).order("prazo_resposta", { ascending: true, nullsFirst: false }).limit(opts.limite ?? 500);
  if (lojaIds) q = q.in("loja_id", lojaIds);
  if (opts.encerradas) q = q.eq("etapa", "encerrado").order("plataforma_atualizado_em", { ascending: false });
  else q = q.neq("etapa", "encerrado");
  const { data } = await q;
  return ((data || []) as unknown) as DevolucaoResumo[];
}

export async function carregarCaso(id: string): Promise<DevolucaoResumo | null> {
  const { data } = await supabase.from("devolucoes").select(CAMPOS).eq("id", id).maybeSingle();
  return (data as unknown as DevolucaoResumo) ?? null;
}

export type MidiaTela = { id: string; origem: string; tipo: string; url: string | null; legenda: string | null; segundo_no_video: number | null; quadro_do_video: string | null; storage_path: string | null; criado_em: string };
export async function midiasDoCaso(id: string): Promise<MidiaTela[]> {
  const { data } = await supabase.from("devolucao_midias").select("id, origem, tipo, storage_path, url_plataforma, legenda, segundo_no_video, quadro_do_video, criado_em").eq("devolucao_id", id).order("criado_em", { ascending: true });
  const saida: MidiaTela[] = [];
  for (const m of data || []) {
    const url = m.storage_path ? await urlAssinada(m.storage_path, 3600) : (m.url_plataforma as string | null);
    saida.push({ id: m.id, origem: m.origem, tipo: m.tipo, url, legenda: m.legenda, segundo_no_video: m.segundo_no_video == null ? null : Number(m.segundo_no_video), quadro_do_video: m.quadro_do_video, storage_path: m.storage_path, criado_em: m.criado_em });
  }
  return saida;
}

export async function eventosDoCaso(id: string) {
  const { data } = await supabase.from("devolucao_eventos").select("id, quando, origem, tipo, descricao, dados").eq("devolucao_id", id).order("quando", { ascending: true }).limit(200);
  return data || [];
}

export async function inspecaoDoCaso(id: string) {
  const { data } = await supabase.from("devolucao_inspecoes").select("*").eq("devolucao_id", id).order("criado_em", { ascending: false }).limit(1).maybeSingle();
  return data;
}

export async function aprovacoesDoCaso(id: string) {
  const { data } = await supabase.from("devolucao_aprovacoes").select("id, acao, pedida_em, via, decisao, decidido_por, decidido_em, executada_em, erro").eq("devolucao_id", id).order("pedida_em", { ascending: false }).limit(20);
  return data || [];
}

// "Hoje o assistente fez": eventos de hoje com origem assistente/sistema (regras).
export async function feitoHoje(lojaIds: string[] | null) {
  const inicio = new Date();
  inicio.setHours(0, 0, 0, 0);
  let q = supabase.from("devolucao_eventos").select("quando, tipo, descricao, devolucoes!inner(loja_id, plataforma_id)").in("origem", ["assistente", "sistema"]).gte("quando", inicio.toISOString()).order("quando", { ascending: false }).limit(12);
  if (lojaIds) q = q.in("devolucoes.loja_id", lojaIds);
  const { data } = await q;
  return (data || []) as unknown as { quando: string; tipo: string; descricao: string | null; devolucoes: { plataforma_id: string } }[];
}

// Pedido ligado (para a tela do caso): valor, cliente, uf, data.
export async function pedidoDoCaso(lojaId: string, pedidoId: string) {
  const { data } = await supabase.from("pedidos").select("id, pedido_externo_id, valor_total, valor_liquido, data_pedido, status, uf, cliente_nome").eq("loja_id", lojaId).eq("pedido_externo_id", pedidoId).maybeSingle();
  return data;
}

// Busca do recebimento: rastreio reverso, número do pedido ou id da devolução.
export async function buscarParaRecebimento(lojaIds: string[] | null, termo: string): Promise<DevolucaoResumo[]> {
  const t = termo.trim();
  if (!t) return [];
  let q = supabase.from("devolucoes").select(CAMPOS).or(`rastreio_reverso.ilike.%${t}%,pedido_id.ilike.%${t}%,plataforma_id.ilike.%${t}%`).limit(10);
  if (lojaIds) q = q.in("loja_id", lojaIds);
  const { data } = await q;
  return ((data || []) as unknown) as DevolucaoResumo[];
}
