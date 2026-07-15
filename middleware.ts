import { NextResponse, type NextRequest } from "next/server";
import { atualizarSessao } from "@/lib/supabase/middleware";

// Rotas chamadas pela Vercel (cron). Ficam liberadas via CRON_SECRET.
const ROTAS_CRON = [
  "/api/shopee/pedidos/criar-lotes-automatico",
  "/api/shopee/pedidos/processar-lotes",
  "/api/shopee/pedidos/enriquecer-detalhes",
  "/api/shopee/pedidos/enriquecer-financeiro",
  "/api/shopee/avaliacoes/responder",
  "/api/shopee/avaliacoes/sincronizar",
  "/api/shopee/chat/sincronizar",
  "/api/shopee/chat/responder",
  "/api/shopee/produtos/descricoes",
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1) Webhook do Telegram: já se protege pelo secret no header. Deixa passar.
  if (pathname === "/api/telegram/webhook") {
    return NextResponse.next();
  }

  // 2) Crons da Vercel: a Vercel envia "Authorization: Bearer $CRON_SECRET".
  //    Enquanto CRON_SECRET não estiver configurado, libera por caminho para
  //    não parar a automação; depois de configurado, passa a exigir o segredo.
  if (ROTAS_CRON.includes(pathname)) {
    const segredo = process.env.CRON_SECRET;
    if (!segredo) return NextResponse.next();
    const auth = request.headers.get("authorization");
    if (auth === `Bearer ${segredo}`) return NextResponse.next();
    return NextResponse.json({ erro: "cron não autorizado" }, { status: 401 });
  }

  // 3) Todo o resto exige usuário logado.
  return atualizarSessao(request);
}

export const config = {
  // Roda em tudo, menos assets estáticos do Next e arquivos públicos.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
