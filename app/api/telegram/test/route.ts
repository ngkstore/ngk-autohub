import { NextResponse } from "next/server";
import { enviarTelegram } from "@/lib/telegram";

export const dynamic = "force-dynamic";

export async function GET() {
  const temToken = !!process.env.TELEGRAM_BOT_TOKEN;
  const temChatId = !!process.env.TELEGRAM_CHAT_ID;

  if (!temToken || !temChatId) {
    return NextResponse.json({
      sucesso: false,
      temToken,
      temChatId,
      erro: "Variáveis TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID não configuradas na Vercel.",
    });
  }

  const ok = await enviarTelegram(
    "✅ Teste de produção do NGK AutoHub — as notificações de chat escalado vão chegar aqui."
  );

  return NextResponse.json({ sucesso: ok, temToken, temChatId });
}
