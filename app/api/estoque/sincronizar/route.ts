import { NextRequest, NextResponse } from "next/server";
import { autorizar } from "@/lib/autorizacao";
import { supabase } from "@/lib/supabase";
import { enviarTelegram } from "@/lib/telegram";
import { coletarEstoqueUpseller } from "@/lib/upseller/estoque";
import { pendenciasEstoque } from "@/lib/estoque/pendencias";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const BASE_URL = process.env.APP_URL || "https://ngk-autohub.vercel.app";

// D1/D4 — cron diário: coleta o estoque do UpSeller (foto do dia) e avisa no Telegram
// ruptura e crítico uma vez por dia. Também aceita ?alertas=0 (só coleta) e admin logado.
export async function GET(request: NextRequest) {
  const autz = await autorizar(request);
  if (!autz.ok) return autz.resposta;
  const coleta = await coletarEstoqueUpseller();
  let alertas: { enviados: number; motivo?: string } = { enviados: 0 };
  if (request.nextUrl.searchParams.get("alertas") !== "0") {
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
  return NextResponse.json({ sucesso: !coleta.erro, coleta, alertas });
}
