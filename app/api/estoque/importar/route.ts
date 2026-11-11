import { NextRequest, NextResponse } from "next/server";
import { escopoDoUsuario } from "@/lib/conta";
import { supabase } from "@/lib/supabase";
import { importarMapeamento, importarProdutosArmazem } from "@/lib/estoque/importar";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// D2 — importa planilhas do UpSeller em CSV (admin da conta).
//   POST multipart: arquivo=<csv>, tipo=produtos|mapeamento, loja=<loja_id opcional>
export async function POST(request: NextRequest) {
  const escopo = await escopoDoUsuario();
  if (!escopo.admin) return NextResponse.json({ sucesso: false, erro: "Só o administrador." }, { status: 403 });
  const form = await request.formData();
  const arquivo = form.get("arquivo");
  const tipo = String(form.get("tipo") || "produtos");
  if (!(arquivo instanceof File)) return NextResponse.json({ sucesso: false, erro: "Envie o arquivo CSV." }, { status: 400 });
  if (arquivo.size > 20 * 1024 * 1024) return NextResponse.json({ sucesso: false, erro: "Arquivo acima de 20 MB." }, { status: 400 });
  const buf = Buffer.from(await arquivo.arrayBuffer());
  let texto = buf.toString("utf8");
  if (texto.includes("�")) texto = buf.toString("latin1"); // exportações em ANSI
  if (tipo === "mapeamento") {
    const { data: lojas } = await supabase.from("lojas").select("id, apelido, marketplace").in("id", escopo.lojaIds.length ? escopo.lojaIds : ["00000000-0000-0000-0000-000000000000"]);
    const mapa = new Map((lojas || []).map((l) => [l.apelido.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""), { id: l.id, canal: (l.marketplace === "tiktok_shop" ? "tiktok" : "shopee") as "shopee" | "tiktok" }]));
    const lojaPadrao = String(form.get("loja") || "") || null;
    const r = await importarMapeamento(texto, lojaPadrao, mapa);
    return NextResponse.json({ sucesso: true, ...r });
  }
  const r = await importarProdutosArmazem(texto);
  return NextResponse.json({ sucesso: true, ...r });
}
