import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { importarShopee } from "@/lib/importadores/shopee";
import { importarTikTok } from "@/lib/importadores/tiktok";
import { escopoDoUsuario, podeVerLoja } from "@/lib/conta";

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

    // Escopo por conta: quem aciona só pode mexer nas lojas da conta dele.
    const escopo = await escopoDoUsuario();

    if (lojaId) {
      if (!podeVerLoja(escopo, lojaId)) {
        return NextResponse.json(
          { sucesso: false, erro: "Loja fora da sua conta." },
          { status: 403 }
        );
      }
      if (marketplace === "shopee") {
        const resultado = await importarShopee({ lojaId, tipo });
        return NextResponse.json(resultado);
      }

      if (marketplace === "tiktok") {
        const resultado = await importarTikTok({ lojaId, tipo });
        return NextResponse.json(resultado);
      }
    }

    // Sem lojaId (fallback): opera nas lojas do marketplace, mas restrito à
    // conta do usuário (admin = todas).
    let lojasQuery = supabase
      .from("lojas")
      .select("*")
      .ilike("marketplace", `%${marketplace}%`);
    if (!escopo.admin) {
      lojasQuery = lojasQuery.in(
        "id",
        escopo.lojaIds.length ? escopo.lojaIds : ["00000000-0000-0000-0000-000000000000"]
      );
    }
    const { data: lojas } = await lojasQuery;

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