import { supabase } from "@/lib/supabase";
import { editarMensagem, responderCallback } from "@/lib/telegram";
import { carregarDevolucao, executar } from "@/lib/devolucoes/acoes";
import { linkCaso } from "@/lib/devolucoes/aprovacao";
import type { Acao } from "@/lib/devolucoes/validar";

// Callbacks "dev:<acao>:<id>" do Telegram (B4). Só quem está em TELEGRAM_CHAT_ID
// (ou na lista TELEGRAM_APROVADORES, ids separados por vírgula) pode aprovar.
export type CallbackTelegram = {
  id: string;
  data?: string;
  from?: { id: number; username?: string; first_name?: string };
  message?: { chat?: { id: number }; message_id?: number; text?: string };
};

function remetenteAutorizado(cq: CallbackTelegram): boolean {
  const ids = new Set(
    [process.env.TELEGRAM_CHAT_ID, ...(process.env.TELEGRAM_APROVADORES || "").split(",")]
      .map((s) => String(s || "").trim())
      .filter(Boolean)
  );
  const from = cq.from?.id ? String(cq.from.id) : "";
  const chat = cq.message?.chat?.id ? String(cq.message.chat.id) : "";
  return (!!from && ids.has(from)) || (!!chat && ids.has(chat) && !!from && ids.has(from));
}

export async function tratarCallbackDevolucao(cq: CallbackTelegram): Promise<void> {
  const partes = (cq.data || "").split(":");
  const acao = partes[1];
  const id = partes.slice(2).join(":");
  const chatId = cq.message?.chat?.id;
  const messageId = cq.message?.message_id;
  const textoOriginal = cq.message?.text || "";
  const quem = cq.from?.username ? `@${cq.from.username}` : cq.from?.first_name || String(cq.from?.id || "");

  if (!remetenteAutorizado(cq)) {
    await responderCallback(cq.id, "Você não tem permissão para aprovar devoluções.");
    return;
  }
  if (acao === "abrir") {
    await responderCallback(cq.id, linkCaso(id));
    return;
  }
  const { data: apr } = await supabase.from("devolucao_aprovacoes").select("id, devolucao_id, acao, decisao, executada_em").eq("id", id).maybeSingle();
  if (!apr) {
    await responderCallback(cq.id, "Pedido de aprovação não encontrado.");
    return;
  }
  if (apr.decisao || apr.executada_em) {
    await responderCallback(cq.id, `Já decidido: ${apr.decisao ?? "executado"}.`);
    return;
  }
  if (acao === "editar") {
    await responderCallback(cq.id, "Abra o caso para editar e enviar: " + linkCaso(apr.devolucao_id as string));
    return;
  }
  if (acao === "recusar") {
    await supabase.from("devolucao_aprovacoes").update({ decisao: "recusada", decidido_por: quem, decidido_em: new Date().toISOString() }).eq("id", id);
    await supabase.from("devolucao_eventos").insert({ devolucao_id: apr.devolucao_id, origem: "equipe", tipo: "aprovacao_recusada", descricao: `Sugestão recusada por ${quem}`, chave: `aprov_rec:${id}` });
    await responderCallback(cq.id, "Recusado. Nada foi enviado.");
    if (chatId && messageId) await editarMensagem(chatId, messageId, `${textoOriginal}\n\n❌ Recusado por ${quem}.`);
    return;
  }
  if (acao === "aprovar") {
    await supabase.from("devolucao_aprovacoes").update({ decisao: "aprovada", decidido_por: quem, decidido_em: new Date().toISOString() }).eq("id", id);
    const d = await carregarDevolucao(apr.devolucao_id as string);
    if (!d) {
      await responderCallback(cq.id, "Caso não encontrado.");
      return;
    }
    const r = await executar(d, apr.acao as Acao, { modo: "aprovado", aprovacaoId: id, decididoPor: quem });
    if (r.enviado) {
      await responderCallback(cq.id, "Aprovado e enviado à plataforma ✅");
      if (chatId && messageId) await editarMensagem(chatId, messageId, `${textoOriginal}\n\n✅ Aprovado por ${quem} e enviado.`);
    } else {
      await responderCallback(cq.id, r.motivo || "Não enviado.");
      if (chatId && messageId) await editarMensagem(chatId, messageId, `${textoOriginal}\n\n⚠️ Aprovado por ${quem}, mas NÃO enviado: ${r.motivo || "erro"}${r.precisaAprovacao ? "\n(Ações pela API desligadas: faça pelo Seller Center.)" : ""}`);
    }
    return;
  }
  await responderCallback(cq.id, "Ação desconhecida.");
}
