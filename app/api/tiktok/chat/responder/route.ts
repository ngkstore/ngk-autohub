import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import {
  reavaliarSessoesAtivasTikTok,
  responderChatsTikTokLote,
  type ResultadoChatTikTok,
} from "@/lib/tiktok/responderChats";
import { flagsPorConta } from "@/lib/flags";
import { vigiarChat } from "@/lib/chat/vigia";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const CHAVE_ATIVO = "tiktok_responder_chat_ativo";
const CHAVE_AUTONOMO = "tiktok_responder_chat_autonomo";

function agregar(resultados: ResultadoChatTikTok[]) {
  return resultados.reduce(
    (acc, r) => ({
      processados: acc.processados + r.processados,
      enviados: acc.enviados + r.enviados,
      escalados: acc.escalados + r.escalados,
      propostas: [...acc.propostas, ...r.propostas],
      erro: r.erro || acc.erro,
    }),
    {
      processados: 0,
      enviados: 0,
      escalados: 0,
      propostas: [] as ResultadoChatTikTok["propostas"],
      erro: undefined as string | undefined,
    }
  );
}

// GET: cron — processa lojas TikTok com robô ativo (flag por conta)
export async function GET() {
  try {
    const { data: tokens } = await supabase
      .from("marketplace_tokens")
      .select("loja_id, lojas(conta_id)")
      .eq("marketplace", "tiktok_shop")
      .eq("status", "ativo");

    const lojas = (tokens || []).map((t) => ({
      lojaId: t.loja_id as string,
      contaId: (t.lojas as unknown as { conta_id: string } | null)?.conta_id,
    }));

    const [ativos, autonomos] = await Promise.all([
      flagsPorConta(CHAVE_ATIVO),
      flagsPorConta(CHAVE_AUTONOMO),
    ]);

    // Rede de segurança a cada ~20 min: reanalisa a caixa "Atribuído" (sessões
    // de atendimento ativas) direto na API. Se o sync perdeu alguma conversa
    // (lista fora de ordem, não-lida zerada no Seller Center, cliente fora da
    // janela…), ela volta pra fila aqui — sem depender do que o sync enxergou.
    const minuto = new Date().getUTCMinutes();
    const redeSeguranca = minuto % 20 < 2;

    const resultados: ResultadoChatTikTok[] = [];
    const lojasAtivas: string[] = [];
    const sessoes: unknown[] = [];
    for (const l of lojas) {
      if (!l.contaId || !ativos[l.contaId]) continue;
      lojasAtivas.push(l.lojaId);
      if (redeSeguranca) {
        try {
          sessoes.push({ lojaId: l.lojaId, ...(await reavaliarSessoesAtivasTikTok(l.lojaId)) });
        } catch (e) {
          sessoes.push({ lojaId: l.lojaId, erro: e instanceof Error ? e.message : String(e) });
        }
      }
      try {
        resultados.push(
          await responderChatsTikTokLote({
            lojaId: l.lojaId,
            limite: 15,
            enviar: true,
            autonomo: !!autonomos[l.contaId],
          })
        );
      } catch (e) {
        // Uma loja com problema (token, etc.) não pode parar as outras.
        resultados.push({
          processados: 0,
          enviados: 0,
          escalados: 0,
          propostas: [],
          erro: `loja ${l.lojaId}: ${e instanceof Error ? e.message : String(e)}`,
        });
      }
    }

    const total = agregar(resultados);
    const vigia = await vigiarChat("tiktok_shop", lojasAtivas, total.erro);
    return NextResponse.json({ sucesso: true, ...total, vigia, ...(redeSeguranca ? { sessoes } : {}) });
  } catch (error) {
    return NextResponse.json(
      { sucesso: false, erro: error instanceof Error ? error.message : "Erro robô TikTok" },
      { status: 500 }
    );
  }
}

// POST: manual (painel/botão) — usa conta do usuário logado, não exige flag ativa
export async function POST(request: NextRequest) {
  let limite = 5;
  let enviar = false;
  let autonomo = false;
  try {
    const body = await request.json();
    if (body?.limite) limite = Number(body.limite);
    if (typeof body?.enviar === "boolean") enviar = body.enviar;
    if (typeof body?.autonomo === "boolean") autonomo = body.autonomo;
  } catch { /* padrão */ }

  try {
    const { data: tokens } = await supabase
      .from("marketplace_tokens")
      .select("loja_id")
      .eq("marketplace", "tiktok_shop")
      .eq("status", "ativo");

    const ids = [...new Set((tokens || []).map((t) => t.loja_id as string))];
    const resultados: ResultadoChatTikTok[] = [];
    for (const lojaId of ids) {
      resultados.push(await responderChatsTikTokLote({ lojaId, limite, enviar, autonomo }));
    }
    return NextResponse.json({ sucesso: true, enviar, autonomo, ...agregar(resultados) });
  } catch (error) {
    return NextResponse.json(
      { sucesso: false, erro: error instanceof Error ? error.message : "Erro robô TikTok" },
      { status: 500 }
    );
  }
}
