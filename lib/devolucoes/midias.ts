import { supabase } from "@/lib/supabase";
import type { MidiaComprador } from "@/lib/devolucoes/tipos";

export const BUCKET_DEVOLUCOES = "devolucoes";
const LIMITE_BYTES = 60 * 1024 * 1024; // vídeo do comprador até 60 MB; acima fica só o link

// Copia fotos e vídeos do comprador para o Storage (os links das plataformas expiram).
// Idempotente: (devolucao_id, url_plataforma) é único; o que já existe é pulado.
export async function guardarMidiasComprador(devolucaoId: string, midias: MidiaComprador[]): Promise<{ novas: number; erros: number }> {
  if (midias.length === 0) return { novas: 0, erros: 0 };
  const { data: existentes } = await supabase.from("devolucao_midias").select("url_plataforma").eq("devolucao_id", devolucaoId);
  const ja = new Set((existentes || []).map((m) => m.url_plataforma));
  let novas = 0;
  let erros = 0;
  for (const m of midias) {
    if (!m.url || ja.has(m.url)) continue;
    let storagePath: string | null = null;
    try {
      const r = await fetch(m.url, { cache: "no-store" });
      const tipo = r.headers.get("content-type") || (m.tipo === "video" ? "video/mp4" : "image/jpeg");
      const tamanho = Number(r.headers.get("content-length") || 0);
      if (r.ok && tamanho <= LIMITE_BYTES) {
        const buf = Buffer.from(await r.arrayBuffer());
        if (buf.length <= LIMITE_BYTES) {
          const ext = tipo.includes("mp4") ? "mp4" : tipo.includes("png") ? "png" : tipo.includes("webp") ? "webp" : m.tipo === "video" ? "mp4" : "jpg";
          storagePath = `${devolucaoId}/comprador/${Date.now()}-${novas}.${ext}`;
          const up = await supabase.storage.from(BUCKET_DEVOLUCOES).upload(storagePath, buf, { contentType: tipo, upsert: true });
          if (up.error) {
            storagePath = null;
            erros++;
          }
        }
      }
    } catch {
      erros++;
    }
    const { error } = await supabase.from("devolucao_midias").insert({
      devolucao_id: devolucaoId,
      origem: "comprador",
      tipo: m.tipo,
      storage_path: storagePath,
      url_plataforma: m.url,
      legenda: m.legenda ?? null,
    });
    if (!error) novas++;
  }
  return { novas, erros };
}

// URL assinada (1 h) para a tela mostrar uma mídia do bucket privado.
export async function urlAssinada(storagePath: string, segundos = 3600): Promise<string | null> {
  const { data } = await supabase.storage.from(BUCKET_DEVOLUCOES).createSignedUrl(storagePath, segundos);
  return data?.signedUrl ?? null;
}

// URL assinada de UPLOAD (navegador manda direto para o Storage) — usada na inspeção (B5).
export async function urlUpload(storagePath: string): Promise<{ url: string; token: string } | null> {
  const { data } = await supabase.storage.from(BUCKET_DEVOLUCOES).createSignedUploadUrl(storagePath);
  return data ? { url: data.signedUrl, token: data.token } : null;
}
