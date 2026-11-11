import { NextRequest, NextResponse } from "next/server";
import { autorizarAdmin } from "@/lib/autorizacao";
import { listarArmazens, listarSkusArmazem, mcpListaFerramentas, mcpToolBruto, paginaSkusBruta, upsellerConfigurado } from "@/lib/upseller/cliente";

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
    const chamar = request.nextUrl.searchParams.get("chamar");
    if (chamar) {
      // ?chamar=<ferramenta de leitura>&args=<json>  → resposta crua (para descobrir o formato)
      const args = JSON.parse(request.nextUrl.searchParams.get("args") || "{}");
      const resp = await mcpToolBruto(chamar, args).catch((e) => ({ erro: String(e) }));
      return NextResponse.json({ sucesso: true, chamar, args, resposta: JSON.stringify(resp).slice(0, 6000) });
    }
    if (request.nextUrl.searchParams.get("tools") === "1") {
      const lista = await mcpListaFerramentas();
      const nome = request.nextUrl.searchParams.get("tool");
      const tools = (((lista.result as Record<string, unknown>) || {}).tools as Record<string, unknown>[]) || [];
      if (nome) return NextResponse.json({ sucesso: true, tool: tools.find((t) => t.name === nome) ?? null, nomes: tools.map((t) => t.name) });
      return NextResponse.json({ sucesso: true, nomes: tools.map((t) => t.name) });
    }
    const armazens = await listarArmazens();
    const sp = request.nextUrl.searchParams;
    const alvo = sp.get("armazem") || armazens[0]?.id;
    const skus = (sp.get("skus") || "").split(",").map((s) => s.trim()).filter(Boolean);
    const amostra = alvo ? await listarSkusArmazem(alvo, { skus, maxPaginas: 1 }) : [];
    const bruto = alvo && amostra.length === 0 ? await paginaSkusBruta(alvo).catch((e) => ({ erro: String(e) })) : undefined;
    return NextResponse.json({
      sucesso: true,
      porta: cfg.mcp ? "mcp" : "rest",
      armazens: armazens.map((a) => ({ id: a.id, nome: a.nome, tipo: a.tipo, campos: Object.keys(a.bruto) })),
      amostra_skus: amostra.slice(0, 5),
      campos_sku: amostra[0] ? Object.keys(amostra[0].bruto) : [],
      total_na_pagina: amostra.length,
      pagina_bruta: bruto ? JSON.stringify(bruto).slice(0, 4000) : undefined,
    });
  } catch (e) {
    return NextResponse.json({ sucesso: false, configurado: cfg, erro: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
