import { NextRequest, NextResponse } from "next/server";
import { enriquecerRegiaoLoja } from "@/lib/shopee/regiao";
import { listarLojasShopeeAtivas, lojasShopeeDoEscopo } from "@/lib/shopee/lojas";
import { escopoDoUsuario } from "@/lib/conta";
import { autorizar } from "@/lib/autorizacao";

export const dynamic = "force-dynamic";
export const maxDuration = 800;

// GET = cron (todas as lojas). POST = usuário (só as lojas da conta).
async function rodar(lojas: { lojaId: string }[], limite: number) {
  const resultados = [];
  for (const l of lojas) {
    resultados.push(await enriquecerRegiaoLoja({ lojaId: l.lojaId, limite }));
  }
  const comUf = resultados.reduce((t, r) => t + r.comUf, 0);
  const processados = resultados.reduce((t, r) => t + r.processados, 0);
  return NextResponse.json({ sucesso: true, processados, comUf, lojas: resultados });
}

// cron: 120 por loja por rodada (a fila agora inclui os entregues-depois; 4 em paralelo ≈ 40 s). Backfill manual de UF:
//   ?loja=<id>&limite=250   (uma loja por vez, lotes grandes)
export async function GET(request: NextRequest) {
  // Cron (Bearer CRON_SECRET) ou usuário com acesso à loja; em lote só cron/admin.
  const autz = await autorizar(request, [request.nextUrl.searchParams.get("loja")]);
  if (!autz.ok) return autz.resposta;
  const loja = request.nextUrl.searchParams.get("loja");
  const limite = Number(request.nextUrl.searchParams.get("limite")) || 120;
  let lojas = await listarLojasShopeeAtivas();
  if (loja) lojas = lojas.filter((l) => l.lojaId === loja);
  return rodar(lojas, limite);
}

export async function POST(request: NextRequest) {
  let limite = 60;
  try {
    const body = await request.json();
    if (body?.limite) limite = Number(body.limite);
  } catch {
    // padrão
  }
  const escopo = await escopoDoUsuario();
  const lojas = await lojasShopeeDoEscopo(escopo);
  return rodar(lojas, limite);
}
