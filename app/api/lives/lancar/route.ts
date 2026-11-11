import { NextRequest, NextResponse } from "next/server";
import { escopoDoUsuario, podeVerLoja } from "@/lib/conta";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// E3/E4 — lançamentos manuais:
//   POST { live: { loja_id, inicio, duracao_min, receita, pedidos, espectadores, pico, observacao } }  (live da Shopee, sem API no Brasil)
//   POST { sps: { loja_id, dia, sps, observacao } }                                                   (SPS do TikTok, sem API no Brasil)
export async function POST(request: NextRequest) {
  const escopo = await escopoDoUsuario();
  let b: { live?: Record<string, unknown>; sps?: Record<string, unknown> };
  try {
    b = await request.json();
  } catch {
    return NextResponse.json({ sucesso: false, erro: "JSON inválido." }, { status: 400 });
  }
  if (b.live) {
    const l = b.live;
    const lojaId = String(l.loja_id || "");
    if (!podeVerLoja(escopo, lojaId)) return NextResponse.json({ sucesso: false, erro: "Loja fora da sua conta." }, { status: 403 });
    const inicio = l.inicio ? new Date(String(l.inicio)) : null;
    if (!inicio || Number.isNaN(inicio.getTime())) return NextResponse.json({ sucesso: false, erro: "Informe a data e hora da live." }, { status: 400 });
    const dur = Math.max(0, Number(l.duracao_min) || 0) * 60;
    const receita = Number(l.receita) || 0;
    const { data: loja } = await supabase.from("lojas").select("marketplace").eq("id", lojaId).maybeSingle();
    const { data, error } = await supabase
      .from("lives")
      .insert({ canal: loja?.marketplace === "tiktok_shop" ? "tiktok" : "shopee", loja_id: lojaId, live_id: null, origem: "manual", inicio: inicio.toISOString(), fim: new Date(inicio.getTime() + dur * 1000).toISOString(), duracao_s: dur, receita, pedidos: Number(l.pedidos) || 0, espectadores: l.espectadores ? Number(l.espectadores) : null, pico: l.pico ? Number(l.pico) : null, receita_por_hora: dur > 0 ? Math.round((receita / (dur / 3600)) * 100) / 100 : null, observacao: (l.observacao as string) || null, criador_nome: (l.apresentador as string) || null })
      .select("id")
      .single();
    if (error) return NextResponse.json({ sucesso: false, erro: error.message }, { status: 500 });
    return NextResponse.json({ sucesso: true, id: data.id });
  }
  if (b.sps) {
    const s = b.sps;
    const lojaId = String(s.loja_id || "");
    if (!podeVerLoja(escopo, lojaId)) return NextResponse.json({ sucesso: false, erro: "Loja fora da sua conta." }, { status: 403 });
    const sps = Number(String(s.sps).replace(",", "."));
    if (!(sps >= 0 && sps <= 5)) return NextResponse.json({ sucesso: false, erro: "SPS entre 0 e 5." }, { status: 400 });
    const { error } = await supabase.from("sps_lancamentos").upsert({ loja_id: lojaId, dia: String(s.dia || new Date().toISOString().slice(0, 10)), sps, origem: "manual", observacao: (s.observacao as string) || null }, { onConflict: "loja_id,dia" });
    if (error) return NextResponse.json({ sucesso: false, erro: error.message }, { status: 500 });
    return NextResponse.json({ sucesso: true });
  }
  return NextResponse.json({ sucesso: false, erro: "Nada a lançar." }, { status: 400 });
}
