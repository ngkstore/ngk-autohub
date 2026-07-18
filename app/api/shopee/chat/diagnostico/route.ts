import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { escopoDoUsuario } from "@/lib/conta";
import { listarLojasShopeeAtivas } from "@/lib/shopee/lojas";
import { flagsPorConta } from "@/lib/flags";
import { responderChatsLote } from "@/lib/shopee/responderChats";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Diagnóstico do robô de chat: por que não está respondendo?
export async function GET() {
  const escopo = await escopoDoUsuario();

  // 1) Flags por conta (o cron só age se a flag da conta estiver 'true').
  const [ativos, autonomos] = await Promise.all([
    flagsPorConta("responder_chat_ativo"),
    flagsPorConta("responder_chat_autonomo"),
  ]);

  // 2) Lojas com token ativo (e quando o token foi renovado).
  const lojas = await listarLojasShopeeAtivas();
  const { data: tokens } = await supabase
    .from("marketplace_tokens")
    .select("loja_id, shop_id, status, atualizado_em")
    .eq("marketplace", "shopee");

  // 3) Conversas pendentes.
  const { count: pendentes } = await supabase
    .from("chat_conversas")
    .select("conversation_id", { count: "exact", head: true })
    .eq("precisa_resposta", true);

  // 4) Última resposta enviada pelo robô.
  const { data: ultima } = await supabase
    .from("chat_conversas")
    .select("respondida_em, to_name")
    .not("respondida_em", "is", null)
    .order("respondida_em", { ascending: false })
    .limit(1)
    .maybeSingle();

  // 5) Crédito/chave da IA + teste REAL (sem enviar) numa loja do usuário.
  const temChaveIA = !!process.env.ANTHROPIC_API_KEY;
  let testeRobo: unknown = "não rodado";
  const lojaTeste = escopo.admin
    ? lojas[0]
    : lojas.find((l) => escopo.lojaIds.includes(l.lojaId));
  if (lojaTeste) {
    try {
      const r = await responderChatsLote({
        lojaId: lojaTeste.lojaId,
        limite: 1,
        enviar: false, // NÃO envia — só testa se gera resposta
      });
      testeRobo = {
        loja: lojaTeste.lojaId,
        processados: r.processados,
        gerou_proposta: r.propostas.length,
        erro: r.erro ?? null,
        amostra: r.propostas[0]?.resposta?.slice(0, 120) ?? null,
      };
    } catch (e) {
      testeRobo = { erro: e instanceof Error ? e.message : "erro desconhecido" };
    }
  }

  const contaId = escopo.contaId ?? "";
  return NextResponse.json({
    sucesso: true,
    conta: contaId,
    flag_robo_ligado: ativos[contaId] === true,
    flag_autonomo: autonomos[contaId] === true,
    todas_flags_ativas: ativos,
    lojas_com_token: lojas.length,
    tokens: (tokens || []).map((t) => ({
      shop_id: t.shop_id,
      status: t.status,
      token_renovado_em: t.atualizado_em,
    })),
    chats_pendentes: pendentes ?? 0,
    ultima_resposta_do_robo: ultima?.respondida_em ?? "nunca",
    tem_chave_ia: temChaveIA,
    teste_robo_sem_enviar: testeRobo,
    leitura:
      "flag_robo_ligado=false -> ligue na aba Atendimento. teste_robo com erro de 'credit'/'401' -> acabou o credito Anthropic. token_renovado_em antigo (>4h) -> token travado. chats_pendentes=0 -> nao ha o que responder (talvez o sync parou).",
  });
}
