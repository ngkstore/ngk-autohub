import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { escopoDoUsuario } from "@/lib/conta";

export const dynamic = "force-dynamic";

// Mostra o que as últimas importações realmente guardaram (colunas + 2 linhas
// de amostra), p/ eu conferir o parsing antes de construir a análise em cima.
export async function GET() {
  const escopo = await escopoDoUsuario();

  let q = supabase
    .from("insights_importacoes")
    .select("id, arquivo, colunas, total_linhas, periodo_inicio, periodo_fim, linhas, importado_em")
    .order("importado_em", { ascending: false })
    .limit(5);
  if (!escopo.admin) {
    q = q.in("conta_id", escopo.contaId ? [escopo.contaId] : []);
  }
  const { data, error } = await q;

  if (error) {
    return NextResponse.json({ sucesso: false, erro: error.message }, { status: 500 });
  }

  return NextResponse.json({
    sucesso: true,
    importacoes: (data || []).map((imp) => ({
      arquivo: imp.arquivo,
      periodo: `${imp.periodo_inicio || "?"} a ${imp.periodo_fim || "?"}`,
      total_linhas: imp.total_linhas,
      colunas: imp.colunas,
      amostra: Array.isArray(imp.linhas) ? imp.linhas.slice(0, 2) : null,
      importado_em: imp.importado_em,
    })),
  });
}
