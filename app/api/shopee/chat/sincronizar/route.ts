import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { sincronizarChatsPagina } from "@/lib/shopee/sincronizarChats";
import { listarLojasShopeeAtivas } from "@/lib/shopee/lojas";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Chaves de estado do backfill, por loja (ex.: "chat_next_timestamp:<lojaId>").
const chaveTs = (lojaId: string) => `chat_next_timestamp:${lojaId}`;
const chaveDone = (lojaId: string) => `chat_backfill_done:${lojaId}`;

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

// POST: sincroniza AGORA as conversas mais novas de todas as lojas (botão).
export async function POST() {
  try {
    const lojas = await listarLojasShopeeAtivas();
    const resultados = [];
    for (const loja of lojas) {
      const r = await sincronizarChatsPagina({ loja, direction: "latest" });
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
    const lojas = await listarLojasShopeeAtivas();
    const resultados = [];

    for (const loja of lojas) {
      // 1) Conversas novas (mais recentes).
      const novas = await sincronizarChatsPagina({ loja, direction: "latest" });

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

      resultados.push({ lojaId: loja.lojaId, novas, historico });
    }

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
