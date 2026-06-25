import crypto from "crypto";

type Botao = { text: string; callback_data: string };

function token() {
  return process.env.TELEGRAM_BOT_TOKEN || "";
}

// Segredo do webhook derivado do token (não precisa de variável extra).
export function segredoWebhook(): string {
  const t = token();
  if (!t) return "";
  return crypto.createHash("sha256").update(t).digest("hex").slice(0, 40);
}

async function chamar(metodo: string, corpo: Record<string, unknown>) {
  const t = token();
  if (!t) return null;
  try {
    const r = await fetch(`https://api.telegram.org/bot${t}/${metodo}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
    });
    return r.json();
  } catch {
    return null;
  }
}

// Envia uma notificação. `botoes` vira teclado inline (linhas de botões).
export async function enviarTelegram(
  texto: string,
  botoes?: Botao[][]
): Promise<boolean> {
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token() || !chatId) return false;

  const corpo: Record<string, unknown> = {
    chat_id: chatId,
    text: texto,
    disable_web_page_preview: true,
  };
  if (botoes && botoes.length > 0) {
    corpo.reply_markup = { inline_keyboard: botoes };
  }

  const data = await chamar("sendMessage", corpo);
  return !!data?.ok;
}

// Responde o clique de um botão (tira o "carregando" do botão).
export async function responderCallback(callbackId: string, texto: string) {
  await chamar("answerCallbackQuery", {
    callback_query_id: callbackId,
    text: texto,
  });
}

// Edita o texto de uma mensagem já enviada (para marcar "enviada/recusada").
export async function editarMensagem(
  chatId: number | string,
  messageId: number,
  texto: string
) {
  await chamar("editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text: texto,
  });
}
