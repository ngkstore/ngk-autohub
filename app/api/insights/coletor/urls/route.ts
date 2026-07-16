import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { escopoDoUsuario } from "@/lib/conta";

export const dynamic = "force-dynamic";

// Lista os endpoints capturados e MARCA os que trazem posição por item
// (avg_rank / rank / position) — p/ eu saber de onde puxar sem adivinhar.
export async function GET() {
  const escopo = await escopoDoUsuario();

  let q = supabase
    .from("coletor_capturas")
    .select("url, payload, capturado_em")
    .order("capturado_em", { ascending: false })
    .limit(400);
  if (!escopo.admin) {
    q = q.or(
      `conta_id.eq.${escopo.contaId ?? "00000000-0000-0000-0000-000000000000"},conta_id.is.null`
    );
  }
  const { data } = await q;

  const mapa = new Map<
    string,
    { vezes: number; temRank: boolean; temItemId: boolean; amostraRank: string | null }
  >();

  (data || []).forEach((c) => {
    const base = String(c.url || "").split("?")[0];
    const txt = JSON.stringify(c.payload ?? "");
    // procura sinais de posição e de item
    const rank = txt.match(/"(avg_rank|rank|position|ranking)"\s*:\s*([0-9.]+)/);
    const temItemId = /"(item_id|itemid)"\s*:/i.test(txt);

    const atual = mapa.get(base);
    if (atual) {
      atual.vezes++;
      if (rank && !atual.amostraRank) atual.amostraRank = rank[0];
      atual.temRank = atual.temRank || !!rank;
      atual.temItemId = atual.temItemId || temItemId;
    } else {
      mapa.set(base, {
        vezes: 1,
        temRank: !!rank,
        temItemId,
        amostraRank: rank ? rank[0] : null,
      });
    }
  });

  const lista = Array.from(mapa.entries()).map(([url, i]) => ({ url, ...i }));

  return NextResponse.json({
    sucesso: true,
    total_endpoints: lista.length,
    // o que interessa: tem posição E item_id no mesmo payload
    posicao_por_item: lista.filter((l) => l.temRank && l.temItemId),
    so_posicao: lista.filter((l) => l.temRank && !l.temItemId),
    todos: lista.sort((a, b) => b.vezes - a.vezes),
  });
}
