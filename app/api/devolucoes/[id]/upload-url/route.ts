import { NextRequest, NextResponse } from "next/server";
import { escopoDoUsuario, podeVerLoja } from "@/lib/conta";
import { carregarDevolucao } from "@/lib/devolucoes/acoes";
import { urlUpload } from "@/lib/devolucoes/midias";

export const dynamic = "force-dynamic";

const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "video/mp4": "mp4", "video/quicktime": "mov" };

// B5 — URL de upload assinada: o navegador manda o arquivo direto para o Storage
// (bucket privado `devolucoes`), sem passar pelo servidor. Limite: 3 min de vídeo
// (mp4/mov) ou foto. Depois o navegador chama /midia para registrar.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const escopo = await escopoDoUsuario();
  const d = await carregarDevolucao(id);
  if (!d || !podeVerLoja(escopo, d.loja_id)) return NextResponse.json({ sucesso: false, erro: "Caso não encontrado." }, { status: 404 });
  let body: { tipo_arquivo?: string; finalidade?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ sucesso: false, erro: "JSON inválido." }, { status: 400 });
  }
  const mime = body.tipo_arquivo || "image/jpeg";
  const ext = EXT[mime];
  if (!ext) return NextResponse.json({ sucesso: false, erro: "Tipo não aceito. Use jpg, png, webp, mp4 ou mov." }, { status: 400 });
  const finalidade = (body.finalidade || "prova").replace(/[^a-z_]/g, "");
  const path = `${id}/nos/${finalidade}-${Date.now()}.${ext}`;
  const u = await urlUpload(path);
  if (!u) return NextResponse.json({ sucesso: false, erro: "Não foi possível gerar a URL de upload." }, { status: 500 });
  return NextResponse.json({ sucesso: true, path, url: u.url, token: u.token });
}
