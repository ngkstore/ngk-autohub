import { NextRequest, NextResponse } from "next/server";
import {
  responderChatsLote,
  type ResultadoChat,
} from "@/lib/shopee/responderChats";
import {
  listarLojasShopeeAtivas,
  lojasShopeeDoEscopo,
} from "@/lib/shopee/lojas";
import { escopoDoUsuario } from "@/lib/conta";
import { flagsPorConta } from "@/lib/flags";
import { vigiarChat } from "@/lib/chat/vigia";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const CHAVE_ATIVO = "responder_chat_ativo";
const CHAVE_AUTONOMO = "responder_chat_autonomo";

function agregar(resultados: ResultadoChat[]) {
  return resultados.reduce(
    (acc, r) => ({
      processados: acc.processados + r.processados,
      enviados: acc.enviados + r.enviados,
      escalados: acc.escalados + r.escalados,
      foraJanela: (acc.foraJanela || 0) + (r.foraJanela || 0),
      propostas: [...acc.propostas, ...r.propostas],
      erro: r.erro || acc.erro,
    }),
    { processados: 0, enviados: 0, escalados: 0, foraJanela: 0, propostas: [] as ResultadoChat["propostas"], erro: undefined as string | undefined }
  );
}

// POST: manual, só nas lojas da conta do usuário logado.
export async function POST(request: NextRequest) {
  let limite = 5;
  let enviar = false;
  let autonomo = false;
  try {
    const body = await request.json();
    if (body?.limite) limite = Number(body.limite);
    if (typeof body?.enviar === "boolean") enviar = body.enviar;
    if (typeof body?.autonomo === "boolean") autonomo = body.autonomo;
  } catch {
    // padrão
  }

  try {
    const escopo = await escopoDoUsuario();
    const lojas = await lojasShopeeDoEscopo(escopo);
    const resultados: ResultadoChat[] = [];
    for (const loja of lojas) {
      resultados.push(
        await responderChatsLote({ lojaId: loja.lojaId, limite, enviar, autonomo })
      );
    }
    return NextResponse.json({ sucesso: true, enviar, autonomo, ...agregar(resultados) });
  } catch (error) {
    return NextResponse.json(
      {
        sucesso: false,
        erro: error instanceof Error ? error.message : "Erro ao responder chat.",
      },
      { status: 500 }
    );
  }
}

// GET: cron. Processa TODAS as lojas, mas só age nas cujas CONTAS têm o robô
// ligado (flag por conta). O modo autônomo também é por conta.
export async function GET() {
  try {
    const lojas = await listarLojasShopeeAtivas();
    const [ativos, autonomos] = await Promise.all([
      flagsPorConta(CHAVE_ATIVO),
      flagsPorConta(CHAVE_AUTONOMO),
    ]);

    // Lojas em paralelo e isoladas: em fila, 5 lojas com fila cheia estouravam
    // o tempo do cron e as últimas ficavam sem resposta; e uma loja com
    // problema (token, etc.) não pode parar as outras.
    const ligadas = lojas.filter((l) => l.contaId && ativos[l.contaId]);
    const resultados: ResultadoChat[] = await Promise.all(
      ligadas.map((loja) =>
        responderChatsLote({
          lojaId: loja.lojaId,
          limite: 15,
          enviar: true,
          autonomo: !!autonomos[loja.contaId!],
        }).catch((e) => ({
          processados: 0,
          enviados: 0,
          escalados: 0,
          propostas: [],
          erro: `loja ${loja.lojaId}: ${e instanceof Error ? e.message : String(e)}`,
        }))
      )
    );
    const total = agregar(resultados);
    const vigia = await vigiarChat(
      "shopee",
      ligadas.map((l) => l.lojaId),
      total.erro
    );
    return NextResponse.json({ sucesso: true, ...total, vigia });
  } catch (error) {
    return NextResponse.json(
      {
        sucesso: false,
        erro: error instanceof Error ? error.message : "Erro ao responder chat.",
      },
      { status: 500 }
    );
  }
}
