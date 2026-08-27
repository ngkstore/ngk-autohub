import { NextResponse, type NextRequest } from "next/server";
import { atualizarSessao } from "@/lib/supabase/middleware";

// Rotas chamadas pela Vercel (cron). Ficam liberadas via CRON_SECRET.
const ROTAS_CRON = [
  "/api/shopee/pedidos/criar-lotes-automatico",
  "/api/shopee/pedidos/processar-lotes",
  "/api/shopee/pedidos/enriquecer-detalhes",
  "/api/shopee/pedidos/enriquecer-financeiro",
  "/api/shopee/pedidos/resync-status",
  "/api/shopee/avaliacoes/responder",
  "/api/shopee/avaliacoes/sincronizar",
  "/api/shopee/chat/sincronizar",
  "/api/shopee/chat/responder",
  "/api/shopee/produtos/descricoes",
  "/api/shopee/carteira/sincronizar",
  "/api/shopee/regiao/enriquecer",
  "/api/shopee/ads/sincronizar",
  "/api/shopee/pedidos/resumo-diario",
  "/api/shopee/escrow/debug",
  "/api/shopee/rastreio/debug",
  "/api/tiktok/pedidos/sincronizar",
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1) Webhook do Telegram e coletor da extensão: já se protegem por segredo
  //    próprio no header (não têm sessão de usuário). Deixa passar.
  if (pathname === "/api/telegram/webhook" || pathname === "/api/insights/coletor") {
    return NextResponse.next();
  }

  // 2) Rotas de cron: são acionadas de DUAS formas.
  //    a) Pela Vercel (cron): manda "Authorization: Bearer $CRON_SECRET" -> passa.
  //    b) Por um usuário logado, pelos botões da tela de Sincronização (POST):
  //       não manda o Bearer -> cai na verificação de sessão (atualizarSessao),
  //       que deixa passar se estiver logado (e a rota escopa por conta).
  //    Enquanto CRON_SECRET não estiver configurado, libera por caminho.
  if (ROTAS_CRON.includes(pathname)) {
    const segredo = process.env.CRON_SECRET;
    if (!segredo) return NextResponse.next();
    const auth = request.headers.get("authorization");
    if (auth === `Bearer ${segredo}`) return NextResponse.next(); // cron Vercel
    return atualizarSessao(request); // usuário logado acionando pela tela
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
