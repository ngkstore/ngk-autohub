import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { sincronizarAvaliacoesPagina } from "@/lib/shopee/sincronizarAvaliacoes";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const CHAVE_IDX = "avaliacoes_item_idx"; // índice do produto atual no backfill
const CHAVE_CURSOR = "avaliacoes_item_cursor"; // cursor dentro do produto atual
const CHAVE_DONE = "avaliacoes_backfill_done";
const PAGINAS_POR_RODADA = 40;

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

// POST: sincronização rápida da loja inteira (páginas recentes). Mantida para
// uso manual; o histórico completo é feito pelo GET (produto a produto).
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
//  - Fase histórico: varre PRODUTO A PRODUTO (get_comment com item_id), pois a
//    consulta da loja inteira tem teto. Guarda o índice do produto + cursor.
//  - Fase novas: quando termina o histórico, sincroniza as páginas recentes.
export async function GET() {
  try {
    const { data: rows } = await supabase
      .from("configuracoes")
      .select("chave, valor")
      .in("chave", [CHAVE_IDX, CHAVE_CURSOR, CHAVE_DONE]);

    const estado: Record<string, string> = {};
    (rows || []).forEach((r) => {
      estado[r.chave] = r.valor;
    });

    if (estado[CHAVE_DONE] !== "true") {
      // ---- Fase histórico: produto a produto ----
      const { data: produtos } = await supabase
        .from("produtos")
        .select("item_id")
        .eq("marketplace", "shopee")
        .not("item_id", "is", null)
        .order("item_id", { ascending: true });

      const itens = (produtos || [])
        .map((p) => Number(p.item_id))
        .filter((n) => Number.isFinite(n) && n > 0);

      if (itens.length === 0) {
        return NextResponse.json({
          sucesso: false,
          fase: "historico",
          erro: "Nenhum produto sincronizado — sincronize os produtos primeiro.",
        });
      }

      let idx = Number(estado[CHAVE_IDX] || 0);
      let cursor = estado[CHAVE_CURSOR] || "";
      let orcamento = PAGINAS_POR_RODADA;
      let processados = 0;
      let pulados = 0;

      while (orcamento > 0 && idx < itens.length) {
        const r = await sincronizarAvaliacoesPagina({
          itemId: itens[idx],
          cursor,
          maxPaginas: orcamento,
        });

        // Se um produto der erro, NÃO trava: pula para o próximo (antes ele
        // ficava preso no mesmo produto pra sempre).
        if (r.erro) {
          pulados++;
          idx++;
          cursor = "";
          orcamento -= 1;
          continue;
        }

        processados += r.processados;
        orcamento -= Math.max(1, r.paginasUsadas);

        if (r.done) {
          idx++;
          cursor = "";
        } else {
          cursor = r.nextCursor;
        }
      }

      const concluiu = idx >= itens.length;
      await setConfig(CHAVE_IDX, String(idx));
      await setConfig(CHAVE_CURSOR, cursor);
      if (concluiu) await setConfig(CHAVE_DONE, "true");

      return NextResponse.json({
        sucesso: true,
        fase: "historico",
        processados,
        pulados,
        produtoIndice: idx,
        totalProdutos: itens.length,
        concluido: concluiu,
      });
    }

    // ---- Fase novas: páginas recentes da loja ----
    const r = await sincronizarAvaliacoesPagina({ cursor: "", maxPaginas: 10 });
    return NextResponse.json({ sucesso: !r.erro, fase: "novas", ...r });
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
