import { NextRequest, NextResponse } from "next/server";
import { autorizar } from "@/lib/autorizacao";
import { supabase } from "@/lib/supabase";
import { enviarTelegram } from "@/lib/telegram";
import { coletarEstoqueUpseller } from "@/lib/upseller/estoque";
import { importarMapeamentoUpseller } from "@/lib/upseller/mapeamento";
import { coletarEstoqueTikTok } from "@/lib/tiktok/estoque";
import { pendenciasEstoque } from "@/lib/estoque/pendencias";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const BASE_URL = process.env.APP_URL || "https://ngk-autohub.vercel.app";

// D1/D4 — cron diário: coleta o estoque do UpSeller (foto do dia), o mapeamento
// anúncio → SKU do armazém (UpSeller), o estoque dos anúncios do TikTok, e avisa no
// Telegram ruptura e crítico uma vez por dia. ?alertas=0 (só coleta);
// ?so=upseller|mapeamento|tiktok roda uma etapa só; ?semanas=N (mapeamento, padrão 4).
export async function GET(request: NextRequest) {
  const autz = await autorizar(request);
  if (!autz.ok) return autz.resposta;
  const so = request.nextUrl.searchParams.get("so");
  const semanas = Math.min(12, Math.max(1, Number(request.nextUrl.searchParams.get("semanas")) || 4));
  const roda = (etapa: string) => !so || so === etapa;
  const t0 = Date.now();
  const coleta = roda("upseller") ? await coletarEstoqueUpseller().catch((e) => ({ armazens: 0, skus: 0, erro: e instanceof Error ? e.message : String(e) })) : null;
  const mapeamento = roda("mapeamento") ? await importarMapeamentoUpseller(semanas).catch((e) => ({ linhas: 0, gravadas: 0, lojasSemVinculo: [] as string[], erro: e instanceof Error ? e.message : String(e) })) : null;
  const tiktok = roda("tiktok") ? await coletarEstoqueTikTok().catch((e) => ({ lojas: 0, skus: 0, erros: [e instanceof Error ? e.message : String(e)] })) : null;
  let alertas: { enviados: number; motivo?: string } = { enviados: 0 };
  if (!so && request.nextUrl.searchParams.get("alertas") !== "0") {
    const dia = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
    const chave = `estoque_alerta:${dia}`;
    const { data: ja } = await supabase.from("saude_alertas").select("id").eq("chave", chave).limit(1).maybeSingle();
    if (ja) alertas = { enviados: 0, motivo: "já enviado hoje" };
    else {
      const pend = await pendenciasEstoque(null);
      if (pend.length) {
        const texto = `📦 Estoque: ${pend.filter((p) => p.urgencia === "agora").length} em ruptura, ${pend.length} críticos\n` + pend.slice(0, 8).map((p) => `• ${p.titulo}`).join("\n") + `\n${BASE_URL}/estoque`;
        const ok = await enviarTelegram(texto);
        if (ok) await supabase.from("saude_alertas").insert({ loja_id: null, chave, dia, texto, enviado_em: new Date().toISOString() });
        alertas = { enviados: ok ? pend.length : 0 };
      }
    }
  }
  const sucesso = !(coleta && "erro" in coleta && coleta.erro) && !(mapeamento && "erro" in mapeamento && mapeamento.erro) && !(tiktok && tiktok.erros.length);
  return NextResponse.json({ sucesso, coleta, mapeamento, tiktok, alertas, segundos: Math.round((Date.now() - t0) / 1000) });
}
