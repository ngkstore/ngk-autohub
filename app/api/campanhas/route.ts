import { NextRequest, NextResponse } from "next/server";
import { escopoDoUsuario, podeVerLoja } from "@/lib/conta";
import { supabase } from "@/lib/supabase";
import { calcularMargensCampanha } from "@/lib/campanhas/consultas";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// F1/F3 — campanhas cadastradas à mão e simulação de margem.
//   POST { campanha: { id?, canal, loja_id?, nome, tipo, inicio, fim, prazo_inscricao, desconto_min, estoque_min, exigencias, link, observacao } }
//   POST { item: { campanha_id, sku?, item_id?, nome, preco_normal, preco_campanha, estoque_promocao } }
//   POST { apagar: id } | { apagar_item: id }
//   POST { simular: campanha_id }   → recalcula a margem de todos os itens
export async function POST(request: NextRequest) {
  const escopo = await escopoDoUsuario();
  let b: Record<string, unknown>;
  try {
    b = await request.json();
  } catch {
    return NextResponse.json({ sucesso: false, erro: "JSON inválido." }, { status: 400 });
  }
  if (typeof b.simular === "string") {
    const { data: c } = await supabase.from("campanhas").select("loja_id").eq("id", b.simular).maybeSingle();
    if (!c || (c.loja_id && !podeVerLoja(escopo, c.loja_id as string))) return NextResponse.json({ sucesso: false, erro: "Campanha não encontrada." }, { status: 404 });
    const r = await calcularMargensCampanha(b.simular);
    return NextResponse.json({ sucesso: true, negativos: r.negativos, itens: r.itens.length, parametros: r.parametros });
  }
  if (!escopo.admin) return NextResponse.json({ sucesso: false, erro: "Só o administrador cadastra campanhas." }, { status: 403 });
  if (b.campanha && typeof b.campanha === "object") {
    const c = b.campanha as Record<string, unknown>;
    if (!String(c.nome || "").trim()) return NextResponse.json({ sucesso: false, erro: "Nome da campanha." }, { status: 400 });
    const lojaId = (c.loja_id as string) || null;
    if (lojaId && !podeVerLoja(escopo, lojaId)) return NextResponse.json({ sucesso: false, erro: "Loja fora da sua conta." }, { status: 403 });
    const linha = {
      canal: ["shopee", "tiktok", "ambos"].includes(String(c.canal)) ? c.canal : "shopee",
      loja_id: lojaId,
      nome: String(c.nome).trim(),
      tipo: ["plataforma", "propria", "afiliado", "live"].includes(String(c.tipo)) ? c.tipo : "plataforma",
      inicio: c.inicio ? new Date(String(c.inicio)).toISOString() : null,
      fim: c.fim ? new Date(String(c.fim)).toISOString() : null,
      prazo_inscricao: c.prazo_inscricao ? new Date(String(c.prazo_inscricao)).toISOString() : null,
      desconto_min: c.desconto_min ? Number(c.desconto_min) : null,
      estoque_min: c.estoque_min ? Number(c.estoque_min) : null,
      exigencias: (c.exigencias as string) || null,
      link: (c.link as string) || null,
      observacao: (c.observacao as string) || null,
      origem: "manual",
      atualizado_em: new Date().toISOString(),
    };
    const { data, error } = c.id ? await supabase.from("campanhas").update(linha).eq("id", c.id).select("id").single() : await supabase.from("campanhas").insert(linha).select("id").single();
    if (error) return NextResponse.json({ sucesso: false, erro: error.message }, { status: 500 });
    return NextResponse.json({ sucesso: true, id: data.id });
  }
  if (b.item && typeof b.item === "object") {
    const i = b.item as Record<string, unknown>;
    if (!i.campanha_id) return NextResponse.json({ sucesso: false, erro: "Campanha." }, { status: 400 });
    const { data, error } = await supabase.from("campanha_itens").upsert({ campanha_id: i.campanha_id, item_id: (i.item_id as string) || null, model_id: (i.model_id as string) || "", sku: (i.sku as string) || null, nome: (i.nome as string) || null, preco_normal: i.preco_normal ? Number(i.preco_normal) : null, preco_campanha: i.preco_campanha ? Number(i.preco_campanha) : null, estoque_promocao: i.estoque_promocao ? Number(i.estoque_promocao) : null }, { onConflict: "campanha_id,item_id,model_id" }).select("id").single();
    if (error) return NextResponse.json({ sucesso: false, erro: error.message }, { status: 500 });
    return NextResponse.json({ sucesso: true, id: data.id });
  }
  if (typeof b.apagar === "string") {
    await supabase.from("campanhas").delete().eq("id", b.apagar).eq("origem", "manual");
    return NextResponse.json({ sucesso: true });
  }
  if (typeof b.apagar_item === "string") {
    await supabase.from("campanha_itens").delete().eq("id", b.apagar_item);
    return NextResponse.json({ sucesso: true });
  }
  return NextResponse.json({ sucesso: false, erro: "Nada a fazer." }, { status: 400 });
}
