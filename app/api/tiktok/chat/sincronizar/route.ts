import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import {
  reavaliarNaoLidasTikTok,
  sincronizarChatsTikTok,
} from "@/lib/tiktok/responderChats";
import { registrarSyncOk } from "@/lib/chat/vigia";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

async function processarLojas(opcoes: { paginas?: number; forcar?: boolean }) {
  const { data: lojas } = await supabase
    .from("marketplace_tokens")
    .select("loja_id")
    .eq("marketplace", "tiktok_shop")
    .in("status", ["ativo"]);

  const ids = [...new Set((lojas || []).map((l) => l.loja_id as string))];
  const resultados = [];

  for (const lojaId of ids) {
    try {
      const r = await sincronizarChatsTikTok(lojaId, opcoes);
      await registrarSyncOk("tiktok_shop", lojaId);
      resultados.push({ lojaId, ...r });
    } catch (e) {
      resultados.push({ lojaId, erro: e instanceof Error ? e.message : String(e) });
    }
  }
  return resultados;
}

// GET: cron. `?forcar=1&paginas=N` reanalisa as N páginas mais recentes mesmo
// sem mudança; `?reavaliar=N&pular=M` reanalisa as conversas do banco com
// não-lidas (as duas formas recuperam clientes que ficaram sem resposta).
export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const reavaliar = Number(sp.get("reavaliar")) || 0;
    if (reavaliar > 0) {
      const { data: lojas } = await supabase
        .from("marketplace_tokens")
        .select("loja_id")
        .eq("marketplace", "tiktok_shop")
        .eq("status", "ativo");
      const ids = [...new Set((lojas || []).map((l) => l.loja_id as string))];
      const resultados = [];
      for (const lojaId of ids) {
        resultados.push({
          lojaId,
          ...(await reavaliarNaoLidasTikTok(
            lojaId,
            Math.min(reavaliar, 60),
            Number(sp.get("pular")) || 0
          )),
        });
      }
      return NextResponse.json({ sucesso: true, reavaliacao: resultados });
    }

    const forcar = sp.get("forcar") === "1";
    const paginas = Math.min(Number(sp.get("paginas")) || (forcar ? 3 : 5), 15);
    const resultados = await processarLojas({ paginas, forcar });
    return NextResponse.json({
      sucesso: resultados.every((r) => !("erro" in r && r.erro)),
      lojas: resultados,
    });
  } catch (error) {
    return NextResponse.json(
      { sucesso: false, erro: error instanceof Error ? error.message : "Erro sync chat TikTok" },
      { status: 500 }
    );
  }
}
