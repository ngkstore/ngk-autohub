import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

async function contar(
  filtro: (q: ReturnType<typeof baseQuery>) => ReturnType<typeof baseQuery>
) {
  try {
    const { count, error } = await filtro(baseQuery());
    if (error) return 0;
    return count ?? 0;
  } catch {
    return 0;
  }
}

function baseQuery() {
  return supabase
    .from("avaliacoes")
    .select("id", { count: "exact", head: true })
    .eq("marketplace", "shopee");
}

export async function GET() {
  try {
    const agora = Date.now();
    const umaHora = new Date(agora - 60 * 60 * 1000).toISOString();
    const umDia = new Date(agora - 24 * 60 * 60 * 1000).toISOString();

    const [total, respondidas, pendentes, ultimaHora, ultimoDia] =
      await Promise.all([
        contar((q) => q),
        contar((q) => q.eq("ja_respondida", true)),
        contar((q) => q.eq("ja_respondida", false).not("comment_id", "is", null)),
        contar((q) => q.gte("respondida_em", umaHora)),
        contar((q) => q.gte("respondida_em", umDia)),
      ]);

    const { data: estado } = await supabase
      .from("configuracoes")
      .select("chave, valor")
      .in("chave", [
        "avaliacoes_item_idx",
        "avaliacoes_backfill_done",
      ]);

    const cfg: Record<string, string> = {};
    (estado || []).forEach((r) => {
      cfg[r.chave] = r.valor;
    });

    const { count: totalProdutos } = await supabase
      .from("produtos")
      .select("id", { count: "exact", head: true })
      .eq("marketplace", "shopee")
      .not("item_id", "is", null);

    return NextResponse.json({
      sucesso: true,
      total,
      respondidas,
      pendentes,
      respondidasUltimaHora: ultimaHora,
      respondidasUltimoDia: ultimoDia,
      backfill: {
        produto_atual: Number(cfg["avaliacoes_item_idx"] || 0),
        total_produtos: totalProdutos ?? 0,
        concluido: cfg["avaliacoes_backfill_done"] === "true",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        sucesso: false,
        erro: error instanceof Error ? error.message : "Erro ao obter status.",
      },
      { status: 500 }
    );
  }
}
