import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { escopoDoUsuario, filtroLojas } from "@/lib/conta";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Exporta as divergências de recebimento (recebido ≠ esperado) em CSV, do
// PERÍODO INTEIRO (sem cap), escopado pela conta. Filtro por mês via ?mes=YYYY-MM.
export async function GET(request: NextRequest) {
  const escopo = await escopoDoUsuario();
  const lojaParam = request.nextUrl.searchParams.get("loja") || undefined;
  const lojas = filtroLojas(escopo, lojaParam);

  // Mês (YYYY-MM) -> janela [1º dia, 1º dia do mês seguinte) em BRT.
  const mes = request.nextUrl.searchParams.get("mes") || "";
  let inicio: string | null = null;
  let fim: string | null = null;
  let sufixo = "todos";
  if (/^\d{4}-\d{2}$/.test(mes)) {
    const [y, m] = mes.split("-").map(Number);
    const ny = m === 12 ? y + 1 : y;
    const nm = m === 12 ? 1 : m + 1;
    inicio = `${mes}-01T00:00:00-03:00`;
    fim = `${ny}-${String(nm).padStart(2, "0")}-01T00:00:00-03:00`;
    sufixo = mes;
  }

  const { data } = await supabase.rpc("divergencias_recebimento", {
    p_loja_ids: lojas,
    p_inicio: inicio,
    p_fim: fim,
    p_limite: 100000,
  });
  const divs = (data as Record<string, unknown>[]) || [];

  const num = (v: unknown) => Number(v || 0);
  const c = (s: unknown) => `"${String(s ?? "").replace(/"/g, '""')}"`;
  const money = (v: unknown) => num(v).toFixed(2).replace(".", ",");

  const linhas = [
    "pedido;cliente;uf;esperado;recebido;diferenca;data_pedido",
    ...divs.map((p) =>
      [
        c(p.pedido_externo_id),
        c(p.cliente_nome),
        c(p.uf),
        money(p.esperado),
        money(p.recebido),
        money(p.dif),
        c(p.data_pedido),
      ].join(";")
    ),
  ];

  return new NextResponse("﻿" + linhas.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="divergencias-${sufixo}.csv"`,
    },
  });
}
