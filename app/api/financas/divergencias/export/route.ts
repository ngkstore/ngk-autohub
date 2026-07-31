import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { escopoDoUsuario, filtroLojas } from "@/lib/conta";

export const dynamic = "force-dynamic";

// Exporta as divergências (recebido ≠ esperado) em CSV, escopado pela conta.
export async function GET(request: NextRequest) {
  const escopo = await escopoDoUsuario();
  const lojaParam = request.nextUrl.searchParams.get("loja") || undefined;
  const lojas = filtroLojas(escopo, lojaParam);

  let q = supabase
    .from("pedidos")
    .select("pedido_externo_id, cliente_nome, uf, valor_total, valor_liquido, valor_recebido, recebido_em, data_pedido")
    .eq("marketplace", "shopee")
    .eq("pedido_efetivado", true)
    .not("recebido_em", "is", null)
    .order("data_pedido", { ascending: false })
    .limit(2000);
  if (lojas) q = q.in("loja_id", lojas);
  const { data } = await q;

  const num = (v: unknown) => Number(v || 0);
  const divs = ((data as Record<string, unknown>[]) || []).filter((p) => {
    const esperado = num(p.valor_liquido) || num(p.valor_total);
    return Math.abs(num(p.valor_recebido) - esperado) > 0.5;
  });

  const linhas = [
    "pedido;cliente;uf;esperado;recebido;diferenca;data_pedido",
    ...divs.map((p) => {
      const esperado = num(p.valor_liquido) || num(p.valor_total);
      const dif = num(p.valor_recebido) - esperado;
      const c = (s: unknown) => `"${String(s ?? "").replace(/"/g, '""')}"`;
      return [
        c(p.pedido_externo_id),
        c(p.cliente_nome),
        c(p.uf),
        esperado.toFixed(2).replace(".", ","),
        num(p.valor_recebido).toFixed(2).replace(".", ","),
        dif.toFixed(2).replace(".", ","),
        c(p.data_pedido),
      ].join(";");
    }),
  ];

  return new NextResponse("﻿" + linhas.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="divergencias.csv"',
    },
  });
}
