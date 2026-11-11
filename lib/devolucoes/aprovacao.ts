import { supabase } from "@/lib/supabase";
import { enviarTelegram } from "@/lib/telegram";
import type { Acao } from "@/lib/devolucoes/validar";
import type { Sugestao } from "@/lib/devolucoes/assistente";

// Aprovação no Telegram (B4): resumo do caso + sugestão + valor, botões Aprovar /
// Editar (link para a tela) / Recusar. Callbacks: "dev:aprovar:<aprovacao_id>" e
// "dev:recusar:<aprovacao_id>" (tratados em app/api/telegram/webhook).
const BASE_URL = process.env.APP_URL || "https://ngk-autohub.vercel.app";

export function acaoDaSugestao(s: Sugestao): Acao {
  const tipo = s.decisao === "recusar" ? "disputar" : s.decisao; // na Shopee "recusar" = abrir disputa
  return { tipo, motivo_plataforma: s.motivo_plataforma ?? null, texto: s.mensagem_comprador || null, valor_parcial: s.valor_parcial ?? null };
}

const moeda = (v: number | null | undefined) => `R$ ${Number(v || 0).toFixed(2).replace(".", ",")}`;

export async function pedirAprovacaoTelegram(d: {
  id: string;
  canal: string;
  plataforma_id: string;
  pedido_id: string;
  motivo_codigo: string | null;
  texto_comprador: string | null;
  valor_reembolso_pedido: number | null;
  prazo_resposta: string | null;
  itens: { nome: string | null; quantidade: number }[] | null;
  sugestao: Sugestao | null;
}, acao: Acao, origem: "assistente" | "regra", regraNome?: string | null): Promise<{ aprovacaoId: string; enviado: boolean }> {
  const { data: pendente } = await supabase.from("devolucao_aprovacoes").select("id").eq("devolucao_id", d.id).is("decisao", null).is("executada_em", null).limit(1).maybeSingle();
  if (pendente) return { aprovacaoId: pendente.id as string, enviado: false }; // já tem um pedido aberto

  const { data: apr } = await supabase.from("devolucao_aprovacoes").insert({ devolucao_id: d.id, acao, via: "telegram" }).select("id").single();
  const aprovacaoId = apr?.id as string;
  const s = d.sugestao;
  const prazo = d.prazo_resposta ? new Date(d.prazo_resposta).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "-";
  const itens = (d.itens || []).map((i) => `${i.quantidade}× ${i.nome ?? "?"}`).join(", ") || "-";
  const texto =
    `🔁 Devolução ${d.canal === "tiktok" ? "TikTok" : "Shopee"} · ${d.plataforma_id}\n` +
    `Pedido ${d.pedido_id} · ${itens}\n` +
    `Motivo: ${d.motivo_codigo ?? "-"}${d.texto_comprador ? ` — "${d.texto_comprador.slice(0, 160)}"` : ""}\n` +
    `Reembolso pedido: ${moeda(d.valor_reembolso_pedido)} · Prazo: ${prazo}\n\n` +
    `${origem === "regra" ? `Regra: ${regraNome ?? ""}\n` : ""}` +
    `Sugestão: ${acao.tipo.toUpperCase()}${acao.valor_parcial ? ` ${moeda(acao.valor_parcial)}` : ""}${s ? ` (confiança ${s.confianca})` : ""}\n` +
    `${s?.motivos?.length ? s.motivos.map((m) => `• ${m}`).join("\n") + "\n" : ""}` +
    `${acao.texto ? `\nMensagem ao comprador: "${acao.texto.slice(0, 200)}"` : ""}`;
  const enviado = await enviarTelegram(texto, [
    [
      { text: "✅ Aprovar", callback_data: `dev:aprovar:${aprovacaoId}` },
      { text: "✏️ Editar", callback_data: `dev:editar:${aprovacaoId}` },
      { text: "❌ Recusar", callback_data: `dev:recusar:${aprovacaoId}` },
    ],
    [{ text: "Abrir o caso", callback_data: `dev:abrir:${d.id}` }],
  ]);
  await supabase.from("devolucao_eventos").insert({ devolucao_id: d.id, origem: "sistema", tipo: "aprovacao_pedida", descricao: `Pedido de aprovação (${origem}) enviado ao Telegram: ${acao.tipo}`, chave: `aprov:${aprovacaoId}` });
  return { aprovacaoId, enviado };
}

export function linkCaso(id: string) {
  return `${BASE_URL}/devolucoes/${id}`;
}
