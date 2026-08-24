import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { supabase } from "@/lib/supabase";
import { escopoDoUsuario } from "@/lib/conta";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Recebe a planilha de estoque (SKU da variação + Custo Médio) e grava os
// custos por variação (custos_variacao) nas lojas da conta do usuário.
export async function POST(request: NextRequest) {
  try {
    const form = await request.formData();
    const file = form.get("arquivo");
    if (!(file instanceof Blob)) {
      return NextResponse.json({ sucesso: false, erro: "Arquivo não recebido." }, { status: 400 });
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const wb = XLSX.read(buf, { type: "buffer" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null }) as unknown[][];
    if (!rows.length) {
      return NextResponse.json({ sucesso: false, erro: "Planilha vazia." }, { status: 400 });
    }

    const head = (rows[0] as unknown[]).map((h) => String(h ?? "").toLowerCase());
    const iSku = head.findIndex((h) => h === "sku");
    const iCusto = head.findIndex((h) => h.includes("custo"));
    if (iSku < 0 || iCusto < 0) {
      return NextResponse.json(
        { sucesso: false, erro: "Não encontrei as colunas 'SKU' e 'Custo' na planilha." },
        { status: 400 }
      );
    }

    const mapa = new Map<string, number>();
    for (let i = 1; i < rows.length; i++) {
      const sku = String(rows[i]?.[iSku] ?? "").trim().toUpperCase();
      let c: unknown = rows[i]?.[iCusto];
      if (typeof c === "string") c = Number(c.replace(/[^0-9,.-]/g, "").replace(",", "."));
      const custo = Number(c);
      if (sku && Number.isFinite(custo) && custo > 0) mapa.set(sku, Math.round(custo * 100) / 100);
    }
    if (mapa.size === 0) {
      return NextResponse.json({ sucesso: false, erro: "Nenhum custo válido encontrado." }, { status: 400 });
    }

    // Lojas da conta do usuário logado.
    const escopo = await escopoDoUsuario();
    if (!escopo.contaId) {
      return NextResponse.json({ sucesso: false, erro: "Conta não identificada." }, { status: 403 });
    }
    const { data: lojas } = await supabase.from("lojas").select("id").eq("conta_id", escopo.contaId);
    const lojaIds = (lojas ?? []).map((l) => l.id as string);
    if (lojaIds.length === 0) {
      return NextResponse.json({ sucesso: false, erro: "Nenhuma loja na sua conta." }, { status: 400 });
    }

    const agora = new Date().toISOString();
    const linhas: { loja_id: string; model_sku: string; custo: number; atualizado_em: string }[] = [];
    for (const [model_sku, custo] of mapa) {
      for (const loja_id of lojaIds) linhas.push({ loja_id, model_sku, custo, atualizado_em: agora });
    }

    const lote = 500;
    for (let i = 0; i < linhas.length; i += lote) {
      const { error } = await supabase
        .from("custos_variacao")
        .upsert(linhas.slice(i, i + lote), { onConflict: "loja_id,model_sku" });
      if (error) {
        return NextResponse.json({ sucesso: false, erro: error.message }, { status: 500 });
      }
    }

    return NextResponse.json({
      sucesso: true,
      skus: mapa.size,
      lojas: lojaIds.length,
      linhas: linhas.length,
      arquivo: file instanceof File ? file.name : "planilha",
    });
  } catch (error) {
    return NextResponse.json(
      { sucesso: false, erro: error instanceof Error ? error.message : "Erro ao importar." },
      { status: 500 }
    );
  }
}
