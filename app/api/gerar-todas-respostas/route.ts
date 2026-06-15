import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST() {
  try {
    const { data: avaliacoes } = await supabase
      .from("avaliacoes")
      .select("*");

    const { data: respostasExistentes } = await supabase
      .from("respostas_ia")
      .select("avaliacao_id");

    const idsRespondidos = new Set(
      respostasExistentes?.map((r) => r.avaliacao_id)
    );

    const pendentes =
      avaliacoes?.filter((a) => !idsRespondidos.has(a.id)) || [];

    let geradas = 0;

    for (const avaliacao of pendentes) {
      const respostaApi = await fetch(
        "http://localhost:3000/api/gerar-resposta",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(avaliacao),
        }
      );

      if (respostaApi.ok) {
        geradas++;
      }
    }

    return NextResponse.json({
      sucesso: true,
      geradas,
    });
  } catch (erro) {
    console.error(erro);

    return NextResponse.json(
      {
        sucesso: false,
        erro,
      },
      {
        status: 500,
      }
    );
  }
}