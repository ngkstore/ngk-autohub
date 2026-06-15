import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { importarShopee } from "@/lib/importadores/shopee";
import { importarTikTok } from "@/lib/importadores/tiktok";

type TipoSincronizacao =
  | "produtos"
  | "pedidos"
  | "avaliacoes"
  | "financeiro"
  | "geral";

function normalizarMarketplace(marketplace?: string) {
  const valor = marketplace?.toLowerCase() || "";

  if (valor.includes("shopee")) return "shopee";
  if (valor.includes("tiktok")) return "tiktok";

  return valor;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const tipo: TipoSincronizacao = body.tipo || "geral";
    const marketplace = normalizarMarketplace(body.marketplace);
    const lojaId = body.lojaId;

    if (!marketplace) {
      return NextResponse.json(
        {
          sucesso: false,
          erro: "Marketplace é obrigatório.",
        },
        { status: 400 }
      );
    }

    if (lojaId) {
      if (marketplace === "shopee") {
        const resultado = await importarShopee({ lojaId, tipo });
        return NextResponse.json(resultado);
      }

      if (marketplace === "tiktok") {
        const resultado = await importarTikTok({ lojaId, tipo });
        return NextResponse.json(resultado);
      }
    }

    const { data: lojas } = await supabase
      .from("lojas")
      .select("*")
      .ilike("marketplace", `%${marketplace}%`);

    if (!lojas || lojas.length === 0) {
      return NextResponse.json(
        {
          sucesso: false,
          erro: "Nenhuma loja encontrada para este marketplace.",
        },
        { status: 404 }
      );
    }

    const resultados = [];

    for (const loja of lojas) {
      if (marketplace === "shopee") {
        const resultado = await importarShopee({
          lojaId: loja.id,
          tipo,
        });

        resultados.push(resultado);
      }

      if (marketplace === "tiktok") {
        const resultado = await importarTikTok({
          lojaId: loja.id,
          tipo,
        });

        resultados.push(resultado);
      }
    }

    const sucesso = resultados.filter((item) => item.sucesso).length;
    const erros = resultados.length - sucesso;

    return NextResponse.json({
      sucesso: erros === 0,
      tipo,
      marketplace,
      lojas_processadas: resultados.length,
      sucesso_qtd: sucesso,
      erros_qtd: erros,
      resultados,
    });
  } catch (error) {
    return NextResponse.json(
      {
        sucesso: false,
        erro:
          error instanceof Error
            ? error.message
            : "Erro desconhecido ao sincronizar.",
      },
      { status: 500 }
    );
  }
}