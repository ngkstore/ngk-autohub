import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { sincronizarAvaliacoesPagina } from "@/lib/shopee/sincronizarAvaliacoes";
import {
  listarLojasShopeeAtivas,
  lojasShopeeDoEscopo,
  type LojaShopee,
} from "@/lib/shopee/lojas";
import { escopoDoUsuario } from "@/lib/conta";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Estado do backfill por loja (ex.: "avaliacoes_item_idx:<lojaId>").
const chaveIdx = (lojaId: string) => `avaliacoes_item_idx:${lojaId}`;
const chaveCursor = (lojaId: string) => `avaliacoes_item_cursor:${lojaId}`;
const chaveDone = (lojaId: string) => `avaliacoes_backfill_done:${lojaId}`;
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

// POST: sincronização rápida (páginas recentes) de todas as lojas. Uso manual;
// o histórico completo é feito pelo GET (produto a produto, por loja).
export async function POST(request: NextRequest) {
  let maxPaginas = 40;
  try {
    const body = await request.json();
    if (body?.maxPaginas) maxPaginas = Number(body.maxPaginas);
  } catch {
    // padrões
  }

  try {
    const escopo = await escopoDoUsuario();
    const lojas = await lojasShopeeDoEscopo(escopo);
    const resultados = [];
    for (const loja of lojas) {
      const r = await sincronizarAvaliacoesPagina({ loja, cursor: "", maxPaginas });
      resultados.push({ lojaId: loja.lojaId, ...r });
    }
    return NextResponse.json({
      sucesso: resultados.every((r) => !r.erro),
      lojas: resultados,
    });
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

// Processa o backfill/novas de UMA loja (uma rodada). Extraído para o loop do GET.
async function processarLoja(loja: LojaShopee) {
  const { data: rows } = await supabase
    .from("configuracoes")
    .select("chave, valor")
    .in("chave", [
      chaveIdx(loja.lojaId),
      chaveCursor(loja.lojaId),
      chaveDone(loja.lojaId),
    ]);

  const estado: Record<string, string> = {};
  (rows || []).forEach((r) => {
    estado[r.chave] = r.valor;
  });

  if (estado[chaveDone(loja.lojaId)] !== "true") {
    // ---- Fase histórico: produto a produto (get_comment com item_id) ----
    const { data: produtos } = await supabase
      .from("produtos")
      .select("item_id")
      .eq("marketplace", "shopee")
      .eq("loja_id", loja.lojaId)
      .not("item_id", "is", null)
      .order("item_id", { ascending: true });

    const itens = (produtos || [])
      .map((p) => Number(p.item_id))
      .filter((n) => Number.isFinite(n) && n > 0);

    if (itens.length === 0) {
      return {
        lojaId: loja.lojaId,
        fase: "historico",
        erro: "Nenhum produto sincronizado — sincronize os produtos primeiro.",
      };
    }

    let idx = Number(estado[chaveIdx(loja.lojaId)] || 0);
    let cursor = estado[chaveCursor(loja.lojaId)] || "";
    let orcamento = PAGINAS_POR_RODADA;
    let processados = 0;
    let pulados = 0;

    while (orcamento > 0 && idx < itens.length) {
      const r = await sincronizarAvaliacoesPagina({
        loja,
        itemId: itens[idx],
        cursor,
        maxPaginas: orcamento,
      });

      // Se um produto der erro, NÃO trava: pula para o próximo.
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
    await setConfig(chaveIdx(loja.lojaId), String(idx));
    await setConfig(chaveCursor(loja.lojaId), cursor);
    if (concluiu) await setConfig(chaveDone(loja.lojaId), "true");

    return {
      lojaId: loja.lojaId,
      fase: "historico",
      processados,
      pulados,
      produtoIndice: idx,
      totalProdutos: itens.length,
      concluido: concluiu,
    };
  }

  // ---- Fase novas: páginas recentes da loja ----
  const r = await sincronizarAvaliacoesPagina({ loja, cursor: "", maxPaginas: 10 });
  return { lojaId: loja.lojaId, fase: "novas", ...r };
}

// GET: cron progressivo e automático.
//  - Fase histórico: varre PRODUTO A PRODUTO (get_comment com item_id), pois a
//    consulta da loja inteira tem teto. Guarda o índice do produto + cursor.
//  - Fase novas: quando termina o histórico, sincroniza as páginas recentes.
export async function GET() {
  try {
    const lojas = await listarLojasShopeeAtivas();
    const resultados = [];
    for (const loja of lojas) {
      resultados.push(await processarLoja(loja));
    }
    return NextResponse.json({ sucesso: true, lojas: resultados });
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
