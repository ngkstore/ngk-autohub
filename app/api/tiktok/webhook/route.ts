import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { ressincronizarTikTok } from "@/lib/devolucoes/sincronizar";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Webhook do TikTok Shop (B2). O Gabriel cadastra a URL no Partner Center:
//   https://ngk-autohub.vercel.app/api/tiktok/webhook
// Assinatura (doc "Webhooks > Verify signature"): header `Authorization` =
//   HMAC-SHA256(app_secret, app_key + corpo_bruto) em hex. Sem assinatura válida: 401.
// Eventos tratados: 12 (status da devolução), 64 (pós-venda), 67 (reembolso
// concluído), 11 (cancelamento). Cada evento só ressincroniza aquele caso.
const EVENTOS = new Set([11, 12, 64, 67]);

function assinaturaValida(corpo: string, recebida: string | null): boolean {
  const appKey = process.env.TIKTOK_APP_KEY;
  const secret = process.env.TIKTOK_APP_SECRET;
  if (!appKey || !secret || !recebida) return false;
  const esperada = crypto.createHmac("sha256", secret).update(appKey + corpo).digest("hex");
  const a = Buffer.from(esperada);
  const b = Buffer.from(recebida.trim());
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  const corpo = await request.text();
  if (!assinaturaValida(corpo, request.headers.get("authorization"))) {
    return NextResponse.json({ ok: false, erro: "assinatura inválida" }, { status: 401 });
  }
  let evento: { type?: number; shop_id?: string; data?: Record<string, unknown> };
  try {
    evento = JSON.parse(corpo);
  } catch {
    return NextResponse.json({ ok: false, erro: "json inválido" }, { status: 400 });
  }
  const tipo = Number(evento.type);
  if (!EVENTOS.has(tipo)) return NextResponse.json({ ok: true, ignorado: tipo });
  const d = evento.data || {};
  const returnId = String(d.return_id || d.cancel_id || "");
  if (!returnId) return NextResponse.json({ ok: true, ignorado: "sem id" });
  try {
    const r = await ressincronizarTikTok(String(evento.shop_id || ""), returnId);
    return NextResponse.json({ ...r, tipo });
  } catch (e) {
    // Responde 200 mesmo assim: o cron de 15 min cobre; o TikTok não precisa reenviar.
    return NextResponse.json({ ok: true, tipo, erro: e instanceof Error ? e.message : String(e) });
  }
}

// Verificação de URL (alguns painéis fazem GET ao cadastrar).
export async function GET() {
  return NextResponse.json({ ok: true, webhook: "tiktok" });
}
