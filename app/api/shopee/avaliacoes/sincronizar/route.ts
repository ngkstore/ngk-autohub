import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { sincronizarAvaliacoesPagina } from "@/lib/shopee/sincronizarAvaliacoes";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const CHAVE_CURSOR = "avaliacoes_cursor";
const CHAVE_DONE = "avaliacoes_backfill_done";

async function setConfig(chave: string, valor: string) {
  const { data } = await supabase
    .from("configuracoes")
    .select("chave")
    .eq("chave", chave)
    .maybeSingle();

  if (data) {
    await supabase
      .from("configuracoes")
      .update({ valor, atualizado_em: new Date().toISOString() })
      .eq("chave", chave);
  } else {
    await supabase
      .from("configuracoes")
      .insert({ chave, valor, atualizado_em: new Date().toISOString() });
  }
}

// POST: execução manual (botão). O cliente repassa o cursor até done.
export async function POST(request: NextRequest) {
  let cursor = "";
  let maxPaginas = 40;

  try {
    const body = await request.json();
    if (typeof body?.cursor === "string") cursor = body.cursor;
    if (body?.maxPaginas) maxPaginas = Number(body.maxPaginas);
  } catch {
    // padrões
  }

  try {
    const resultado = await sincronizarAvaliacoesPagina({ cursor, maxPaginas });
    return NextResponse.json({ sucesso: !resultado.erro, ...resultado });
  } catch (error) {
    return NextResponse.json(
      {
        sucesso: false,
        erro:
          error instanceof Error
            ? error.message
            : "Erro ao sincronizar avaliações.",
      },
      { status: 500 }
    );
  }
}

// GET: cron progressivo e automático.
//  - Enquanto o histórico não terminou: continua de onde parou (cursor salvo),
//    avançando pelas avaliações antigas a cada rodada.
//  - Quando termina o histórico: passa a sincronizar só as páginas recentes
//    (avaliações novas), sem reprocessar tudo.
export async function GET() {
  try {
    const { data: rows } = await supabase
      .from("configuracoes")
      .select("chave, valor")
      .in("chave", [CHAVE_CURSOR, CHAVE_DONE]);

    const estado: Record<string, string> = {};
    (rows || []).forEach((r) => {
      estado[r.chave] = r.valor;
    });

    const backfillConcluido = estado[CHAVE_DONE] === "true";

    if (!backfillConcluido) {
      // Fase 1: puxando o histórico antigo, retomando do cursor salvo.
      const cursor = estado[CHAVE_CURSOR] || "";
      const resultado = await sincronizarAvaliacoesPagina({
        cursor,
        maxPaginas: 40,
      });

      if (resultado.erro) {
        return NextResponse.json({ sucesso: false, fase: "historico", ...resultado });
      }

      await setConfig(CHAVE_CURSOR, resultado.nextCursor);
      if (resultado.done) {
        await setConfig(CHAVE_DONE, "true");
      }

      return NextResponse.json({ sucesso: true, fase: "historico", ...resultado });
    }

    // Fase 2: mantendo as novas (páginas recentes).
    const resultado = await sincronizarAvaliacoesPagina({
      cursor: "",
      maxPaginas: 10,
    });

    return NextResponse.json({ sucesso: !resultado.erro, fase: "novas", ...resultado });
  } catch (error) {
    return NextResponse.json(
      {
        sucesso: false,
        erro:
          error instanceof Error
            ? error.message
            : "Erro ao sincronizar avaliações.",
      },
      { status: 500 }
    );
  }
}
