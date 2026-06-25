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

// POST: rodada manual. Body opcional { nextTimestamp }.
export async function POST(request: Request) {
  let nextTimestamp = "";
  try {
    const body = await request.json();
    if (typeof body?.nextTimestamp === "string") nextTimestamp = body.nextTimestamp;
  } catch {
    // padrão
  }

  try {
    const r = await sincronizarChatsPagina({ nextTimestamp });
    return NextResponse.json({ sucesso: !r.erro, ...r });
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

// GET: cron progressivo. Varre o histórico de conversas; ao terminar, refaz a
// primeira página periodicamente para capturar conversas novas.
export async function GET() {
  try {
    const { data: rows } = await supabase
      .from("configuracoes")
      .select("chave, valor")
      .in("chave", [CHAVE_TS, CHAVE_DONE]);

    const estado: Record<string, string> = {};
    (rows || []).forEach((r) => {
      estado[r.chave] = r.valor;
    });

    const done = estado[CHAVE_DONE] === "true";

    // Se o histórico terminou, sincroniza só a primeira página (conversas novas).
    const nextTimestamp = done ? "" : estado[CHAVE_TS] || "";

    const r = await sincronizarChatsPagina({ nextTimestamp });

    if (r.erro) {
      return NextResponse.json({ sucesso: false, fase: done ? "novas" : "historico", ...r });
    }

    if (!done) {
      await setConfig(CHAVE_TS, r.nextTimestamp);
      if (r.done) await setConfig(CHAVE_DONE, "true");
    }

    return NextResponse.json({
      sucesso: true,
      fase: done ? "novas" : "historico",
      ...r,
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
