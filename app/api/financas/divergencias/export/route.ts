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

  // O PostgREST capa a resposta em 1000 linhas (e ignora Range em função),
  // então paginamos via p_offset em blocos de 1000 até acabar.
  const PAGE = 1000;
  const divs: Record<string, unknown>[] = [];
  for (let offset = 0; offset < 200000; offset += PAGE) {
    const { data } = await supabase.rpc("divergencias_recebimento", {
      p_loja_ids: lojas,
      p_inicio: inicio,
      p_fim: fim,
      p_limite: PAGE,
      p_offset: offset,
    });
    const page = (data as Record<string, unknown>[]) || [];
    divs.push(...page);
    if (page.length < PAGE) break;
  }

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
