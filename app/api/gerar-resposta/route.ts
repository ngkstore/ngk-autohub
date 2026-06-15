import { NextResponse } from "next/server";
import { spawn } from "child_process";
import { supabase } from "@/lib/supabase";

function chamarClaude(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const processo = spawn("cmd", ["/c", "claude", "--print"], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    processo.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    processo.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    processo.on("error", (error) => {
      reject(error);
    });

    processo.on("close", (code) => {
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(new Error(stderr || `Claude finalizou com código ${code}`));
      }
    });

    processo.stdin.write(prompt);
    processo.stdin.end();
  });
}

export async function POST(request: Request) {
  const body = await request.json();

  const prompt = `
Use a skill de avaliações da NGK Store.

Crie uma resposta curta, educada e natural para esta avaliação da Shopee.

Produto: ${body.nome_produto}
Cliente: ${body.nome_cliente}
Nota: ${body.avaliacao}
Comentário: ${body.comentario}

Responda apenas com o texto da resposta ao cliente.
`;

  try {
    const resposta = await chamarClaude(prompt);

    const { error } = await supabase
      .from("respostas_ia")
      .insert({
        avaliacao_id: body.id,
        resposta,
        status: "gerada",
      });

    if (error) {
      return NextResponse.json(
        {
          error: "Resposta gerada, mas não foi salva no Supabase.",
          details: error.message,
          resposta,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      resposta,
      salvo: true,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        error: "Erro ao gerar resposta com Claude.",
        details: error.message,
      },
      { status: 500 }
    );
  }
}