import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { sincronizarChatsPagina } from "@/lib/shopee/sincronizarChats";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const CHAVE_TS = "chat_next_timestamp";
const CHAVE_DONE = "chat_backfill_done";

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

// POST: sincroniza AGORA as conversas mais novas (usado pelo botão).
export async function POST() {
  try {
    const r = await sincronizarChatsPagina({ direction: "latest" });
    return NextResponse.json({ sucesso: !r.erro, fase: "novas", ...r });
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

// GET: cron. SEMPRE puxa as conversas novas primeiro (responsivo); e, se o
// histórico ainda não terminou, avança uma página antiga em paralelo.
export async function GET() {
  try {
    // 1) Conversas novas (mais recentes) — para o chat ficar responsivo.
    const novas = await sincronizarChatsPagina({ direction: "latest" });

    // 2) Backfill do histórico (em paralelo, sem atrapalhar as novas).
    const { data: rows } = await supabase
      .from("configuracoes")
      .select("chave, valor")
      .in("chave", [CHAVE_TS, CHAVE_DONE]);

    const estado: Record<string, string> = {};
    (rows || []).forEach((r) => {
      estado[r.chave] = r.valor;
    });

    let historico = null;
    if (estado[CHAVE_DONE] !== "true") {
      historico = await sincronizarChatsPagina({
        direction: "older",
        nextTimestamp: estado[CHAVE_TS] || "",
      });
      if (!historico.erro) {
        await setConfig(CHAVE_TS, historico.nextTimestamp);
        if (historico.done) await setConfig(CHAVE_DONE, "true");
      }
    }

    return NextResponse.json({
      sucesso: !novas.erro,
      novas,
      historico,
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
