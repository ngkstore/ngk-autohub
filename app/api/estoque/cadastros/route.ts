import { NextRequest, NextResponse } from "next/server";
import { escopoDoUsuario } from "@/lib/conta";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// D4 — cadastros do estoque (admin da conta):
//   POST { fornecedor: { id?, nome, prazo_dias, seguranca_dias, caixa_padrao, observacao, ativo } }
//   POST { excecao: { sku, fornecedor_id, prazo_dias, seguranca_dias, caixa } }
//   POST { compra: { sku, quantidade, fornecedor_id, previsao, observacao } }  → "a caminho"
//   POST { compra_recebida: id }
//   POST { fator: { id?, nome, inicio, fim, fator } } | { apagar_fator: id }
//   POST { kit: { sku_kit, componentes: [{ sku, quantidade }] } }
export async function POST(request: NextRequest) {
  const escopo = await escopoDoUsuario();
  if (!escopo.admin) return NextResponse.json({ sucesso: false, erro: "Só o administrador." }, { status: 403 });
  let b: Record<string, unknown>;
  try {
    b = await request.json();
  } catch {
    return NextResponse.json({ sucesso: false, erro: "JSON inválido." }, { status: 400 });
  }
  const agora = new Date().toISOString();
  if (b.fornecedor && typeof b.fornecedor === "object") {
    const f = b.fornecedor as Record<string, unknown>;
    if (!String(f.nome || "").trim()) return NextResponse.json({ sucesso: false, erro: "Nome do fornecedor." }, { status: 400 });
    const linha = { conta_id: escopo.contaId, nome: String(f.nome).trim(), prazo_dias: Number(f.prazo_dias) || 15, seguranca_dias: Number(f.seguranca_dias) || 5, caixa_padrao: f.caixa_padrao ? Number(f.caixa_padrao) : null, observacao: (f.observacao as string) || null, ativo: f.ativo !== false };
    const { data, error } = f.id ? await supabase.from("fornecedores").update(linha).eq("id", f.id).select("id").single() : await supabase.from("fornecedores").insert(linha).select("id").single();
    if (error) return NextResponse.json({ sucesso: false, erro: error.message }, { status: 500 });
    return NextResponse.json({ sucesso: true, id: data.id });
  }
  if (b.excecao && typeof b.excecao === "object") {
    const e = b.excecao as Record<string, unknown>;
    if (!e.sku) return NextResponse.json({ sucesso: false, erro: "SKU." }, { status: 400 });
    const { error } = await supabase.from("fornecedor_sku_excecao").upsert({ sku: String(e.sku), fornecedor_id: (e.fornecedor_id as string) || null, prazo_dias: e.prazo_dias ? Number(e.prazo_dias) : null, seguranca_dias: e.seguranca_dias ? Number(e.seguranca_dias) : null, caixa: e.caixa ? Number(e.caixa) : null }, { onConflict: "sku" });
    if (error) return NextResponse.json({ sucesso: false, erro: error.message }, { status: 500 });
    if (e.fornecedor_id) await supabase.from("catalogo_sku").update({ fornecedor_id: e.fornecedor_id as string, atualizado_em: agora }).eq("sku", String(e.sku));
    return NextResponse.json({ sucesso: true });
  }
  if (b.compra && typeof b.compra === "object") {
    const c = b.compra as Record<string, unknown>;
    if (!c.sku || !(Number(c.quantidade) > 0)) return NextResponse.json({ sucesso: false, erro: "SKU e quantidade." }, { status: 400 });
    const { data, error } = await supabase.from("compras_a_caminho").insert({ sku: String(c.sku), quantidade: Number(c.quantidade), fornecedor_id: (c.fornecedor_id as string) || null, previsao: (c.previsao as string) || null, observacao: (c.observacao as string) || null }).select("id").single();
    if (error) return NextResponse.json({ sucesso: false, erro: error.message }, { status: 500 });
    return NextResponse.json({ sucesso: true, id: data.id });
  }
  if (typeof b.compra_recebida === "string") {
    await supabase.from("compras_a_caminho").update({ recebido: true }).eq("id", b.compra_recebida);
    return NextResponse.json({ sucesso: true });
  }
  if (b.fator && typeof b.fator === "object") {
    const f = b.fator as Record<string, unknown>;
    const linha = { nome: String(f.nome || "Período"), inicio: String(f.inicio), fim: String(f.fim), fator: Number(f.fator) || 1, observacao: (f.observacao as string) || null };
    const { error } = f.id ? await supabase.from("estoque_fator_sazonal").update(linha).eq("id", f.id) : await supabase.from("estoque_fator_sazonal").insert(linha);
    if (error) return NextResponse.json({ sucesso: false, erro: error.message }, { status: 500 });
    return NextResponse.json({ sucesso: true });
  }
  if (typeof b.apagar_fator === "string") {
    await supabase.from("estoque_fator_sazonal").delete().eq("id", b.apagar_fator);
    return NextResponse.json({ sucesso: true });
  }
  if (b.kit && typeof b.kit === "object") {
    const k = b.kit as { sku_kit?: string; componentes?: { sku: string; quantidade: number }[] };
    if (!k.sku_kit || !k.componentes?.length) return NextResponse.json({ sucesso: false, erro: "Kit e componentes." }, { status: 400 });
    await supabase.from("kit_componentes").delete().eq("sku_kit", k.sku_kit);
    await supabase.from("kit_componentes").insert(k.componentes.filter((c) => c.sku).map((c) => ({ sku_kit: k.sku_kit, sku_componente: c.sku.trim(), quantidade: Number(c.quantidade) || 1 })));
    await supabase.from("catalogo_sku").upsert({ sku: k.sku_kit, tipo: "kit", atualizado_em: agora }, { onConflict: "sku" });
    return NextResponse.json({ sucesso: true });
  }
  return NextResponse.json({ sucesso: false, erro: "Nada a fazer." }, { status: 400 });
}
