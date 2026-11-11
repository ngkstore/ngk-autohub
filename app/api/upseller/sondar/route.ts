import { NextRequest, NextResponse } from "next/server";
import { autorizarAdmin } from "@/lib/autorizacao";
import { listarArmazens, listarSkusArmazem, upsellerConfigurado } from "@/lib/upseller/cliente";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// D1 — rota de teste SÓ para admin/cron: lista os armazéns e a 1ª página de SKUs de um
// deles, devolvendo também os campos crus (para anotar no plano o que a API traz).
//   GET ?armazem=<id>&skus=A,B   (sem armazem: usa o primeiro)
export async function GET(request: NextRequest) {
  const autz = await autorizarAdmin(request);
  if (!autz.ok) return autz.resposta;
  const cfg = upsellerConfigurado();
  if (!cfg.mcp && !cfg.rest) return NextResponse.json({ sucesso: false, configurado: cfg, erro: "Crie UPSELLER_MCP_TOKEN (recomendado) ou UPSELLER_CLIENT_ID + UPSELLER_API_TOKEN na Vercel." });
  try {
    const armazens = await listarArmazens();
    const sp = request.nextUrl.searchParams;
    const alvo = sp.get("armazem") || armazens[0]?.id;
    const skus = (sp.get("skus") || "").split(",").map((s) => s.trim()).filter(Boolean);
    const amostra = alvo ? await listarSkusArmazem(alvo, { skus, maxPaginas: 1 }) : [];
    return NextResponse.json({
      sucesso: true,
      porta: cfg.mcp ? "mcp" : "rest",
      armazens: armazens.map((a) => ({ id: a.id, nome: a.nome, tipo: a.tipo, campos: Object.keys(a.bruto) })),
      amostra_skus: amostra.slice(0, 5),
      campos_sku: amostra[0] ? Object.keys(amostra[0].bruto) : [],
      total_na_pagina: amostra.length,
    });
  } catch (e) {
    return NextResponse.json({ sucesso: false, configurado: cfg, erro: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
