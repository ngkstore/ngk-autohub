import { NextRequest, NextResponse } from "next/server";
import { listarLojasShopeeAtivas } from "@/lib/shopee/lojas";
import { sincronizarVariacoesLoja } from "@/lib/shopee/produtoVariacoes";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Cron: sincroniza as variações (models) dos produtos ativos via get_model_list.
// ?loja=<id> só uma loja · ?limite=N produtos por loja por execução (padrão 150;
// pega os nunca sincronizados / mais antigos primeiro, então tudo se renova ao
// longo do dia).
export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const limite = Math.min(500, Math.max(1, Number(sp.get("limite")) || 150));
    const lojaParam = sp.get("loja");
    let lojas = await listarLojasShopeeAtivas();
    if (lojaParam) lojas = lojas.filter((l) => l.lojaId === lojaParam);

    const resultados = [];
    for (const loja of lojas) {
      try {
        resultados.push(await sincronizarVariacoesLoja({ loja, limite }));
      } catch (e) {
        resultados.push({ lojaId: loja.lojaId, erro: e instanceof Error ? e.message : "erro" });
      }
    }
    return NextResponse.json({ sucesso: true, resultados });
  } catch (error) {
    return NextResponse.json({ sucesso: false, erro: error instanceof Error ? error.message : "Erro ao sincronizar variações." }, { status: 500 });
  }
}
