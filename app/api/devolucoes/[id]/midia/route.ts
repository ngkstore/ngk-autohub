import { NextRequest, NextResponse } from "next/server";
import { escopoDoUsuario, podeVerLoja } from "@/lib/conta";
import { supabase } from "@/lib/supabase";
import { carregarDevolucao } from "@/lib/devolucoes/acoes";
import { urlAssinada } from "@/lib/devolucoes/midias";

export const dynamic = "force-dynamic";

// B5 — registra uma mídia NOSSA já enviada ao Storage (foto, vídeo ou quadro do vídeo).
//   POST { storage_path, tipo: "foto"|"video"|"quadro", legenda?, quadro_do_video?, segundo_no_video? }
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const escopo = await escopoDoUsuario();
  const d = await carregarDevolucao(id);
  if (!d || !podeVerLoja(escopo, d.loja_id)) return NextResponse.json({ sucesso: false, erro: "Caso não encontrado." }, { status: 404 });
  let body: { storage_path?: string; tipo?: string; legenda?: string; quadro_do_video?: string; segundo_no_video?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ sucesso: false, erro: "JSON inválido." }, { status: 400 });
  }
  if (!body.storage_path?.startsWith(`${id}/`) || !["foto", "video", "quadro"].includes(body.tipo || "")) return NextResponse.json({ sucesso: false, erro: "Dados inválidos." }, { status: 400 });
  const { data, error } = await supabase
    .from("devolucao_midias")
    .insert({ devolucao_id: id, origem: "nos", tipo: body.tipo, storage_path: body.storage_path, legenda: body.legenda ?? null, quadro_do_video: body.quadro_do_video ?? null, segundo_no_video: body.segundo_no_video ?? null, enviado_em: new Date().toISOString() })
    .select("id")
    .single();
  if (error) return NextResponse.json({ sucesso: false, erro: error.message }, { status: 500 });
  await supabase.from("devolucao_eventos").insert({ devolucao_id: id, origem: "equipe", tipo: "prova_anexada", descricao: `${body.tipo === "quadro" ? "Quadro do vídeo" : body.tipo === "video" ? "Vídeo" : "Foto"} anexado${body.legenda ? `: ${body.legenda}` : ""}`, chave: `midia:${data.id}` });
  const url = await urlAssinada(body.storage_path, 3600);
  return NextResponse.json({ sucesso: true, id: data.id, url });
}
