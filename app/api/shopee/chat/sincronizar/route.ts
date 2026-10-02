import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// Fecha conversas escaladas sem cliente esperando há mais de 7 dias.
// Acumulavam como "abertas" porque o robô marca escalada=true mas não zera precisa_resposta.
async function fecharEscaladasAntiquas() {
  await supabase
    .from("chat_conversas")
    .update({ precisa_resposta: false })
    .eq("marketplace", "shopee")
    .eq("escalada", true)
    .eq("unread_count", 0)
    .lt("atualizado_em", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());
}
import { sincronizarChatsPagina } from "@/lib/shopee/sincronizarChats";
import {
  listarLojasShopeeAtivas,
  lojasShopeeDoEscopo,
} from "@/lib/shopee/lojas";
import { escopoDoUsuario } from "@/lib/conta";
import { registrarSyncOk } from "@/lib/chat/vigia";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Chaves de estado do backfill, por loja (ex.: "chat_next_timestamp:<lojaId>").
const chaveTs = (lojaId: string) => `chat_next_timestamp:${lojaId}`;
const chaveDone = (lojaId: string) => `chat_backfill_done:${lojaId}`;

// A Shopee mudou o comportamento: `direction=latest` sem next_timestamp passou
// a devolver conversas ANTIGAS (2024). O jeito certo de pegar as recentes é
// `direction=older` a partir de AGORA. Também puxamos as NÃO-LIDAS (type=unread),
// que são exatamente os clientes esperando resposta.
async function sincronizarRecentes(
  loja: Parameters<typeof sincronizarChatsPagina>[0]["loja"]
) {
  const agoraNano = String(Date.now() * 1_000_000);
  const recentes = await sincronizarChatsPagina({
    loja,
    direction: "older",
    nextTimestamp: agoraNano,
    maxConversas: 30,
  });
  const naoLidas = await sincronizarChatsPagina({
    loja,
    direction: "older",
    nextTimestamp: agoraNano,
    tipo: "unread",
    maxConversas: 30,
  });
  return {
    conversas: recentes.conversas + naoLidas.conversas,
    mensagens: recentes.mensagens + naoLidas.mensagens,
    erro: recentes.erro || naoLidas.erro,
  };
}

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

// POST: sincroniza AGORA as conversas mais novas das lojas do usuário (botão).
export async function POST() {
  try {
    const escopo = await escopoDoUsuario();
    const lojas = await lojasShopeeDoEscopo(escopo);
    const resultados = [];
    for (const loja of lojas) {
      const r = await sincronizarRecentes(loja);
      resultados.push({ lojaId: loja.lojaId, ...r });
    }
    return NextResponse.json({
      sucesso: resultados.every((r) => !r.erro),
      fase: "novas",
      lojas: resultados,
    });
  } catch (error) {
    return NextResponse.json(
      {
        sucesso: false,
        erro: error instanceof Error ? error.message : "Erro ao sincronizar chat.",
      },
      { status: 500 }
    );
  }
}

// GET: cron. Para CADA loja: puxa as conversas novas primeiro (responsivo) e,
// se o histórico ainda não terminou, avança uma página antiga (cursor por loja).
export async function GET() {
  try {
    await fecharEscaladasAntiquas();
    const lojas = await listarLojasShopeeAtivas();

    // Lojas em paralelo e isoladas: em fila, a última loja esperava todas as
    // outras (e uma loja com erro derrubava o sync das demais).
    const resultados = await Promise.all(lojas.map(sincronizarLoja));

    return NextResponse.json({
      sucesso: resultados.every((r) => !r.novas.erro),
      lojas: resultados,
    });
  } catch (error) {
    return NextResponse.json(
      {
        sucesso: false,
        erro: error instanceof Error ? error.message : "Erro ao sincronizar chat.",
      },
      { status: 500 }
    );
  }
}

async function sincronizarLoja(
  loja: Parameters<typeof sincronizarChatsPagina>[0]["loja"]
) {
  try {
    // 1) Conversas novas (recentes + não-lidas), a partir de agora.
    const novas = await sincronizarRecentes(loja);
    if (!novas.erro) await registrarSyncOk("shopee", loja.lojaId);

    // 2) Backfill do histórico (cursor por loja).
    const { data: rows } = await supabase
      .from("configuracoes")
      .select("chave, valor")
      .in("chave", [chaveTs(loja.lojaId), chaveDone(loja.lojaId)]);

    const estado: Record<string, string> = {};
    (rows || []).forEach((r) => {
      estado[r.chave] = r.valor;
    });

    let historico = null;
    if (estado[chaveDone(loja.lojaId)] !== "true") {
      historico = await sincronizarChatsPagina({
        loja,
        direction: "older",
        nextTimestamp: estado[chaveTs(loja.lojaId)] || "",
      });
      if (!historico.erro) {
        await setConfig(chaveTs(loja.lojaId), historico.nextTimestamp);
        if (historico.done) await setConfig(chaveDone(loja.lojaId), "true");
      }
    }

    return { lojaId: loja.lojaId, novas, historico };
  } catch (e) {
    return {
      lojaId: loja.lojaId,
      novas: {
        conversas: 0,
        mensagens: 0,
        erro: e instanceof Error ? e.message : "Erro ao sincronizar chat.",
      },
      historico: null,
    };
  }
}
