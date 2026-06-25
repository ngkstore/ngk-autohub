// Envia uma notificação para o Telegram (bot da NGK).
// Usa as variáveis de ambiente TELEGRAM_BOT_TOKEN e TELEGRAM_CHAT_ID.
export async function enviarTelegram(texto: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) return false; // sem config, não notifica (silencioso)

  try {
    const response = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: texto,
          disable_web_page_preview: true,
        }),
      }
    );
    const data = await response.json();
    return !!data.ok;
  } catch {
    return false;
  }
}
