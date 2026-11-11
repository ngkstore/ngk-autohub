import { supabase } from "@/lib/supabase";
import { enviarTelegram } from "@/lib/telegram";
import { montarPainel } from "@/lib/painel/pendencias";
import { pendenciasEstoque } from "@/lib/estoque/pendencias";
import { pendenciasCampanhas } from "@/lib/campanhas/pendencias";

// C3 — resumo do Painel do dia no Telegram às 8 h e 14 h (America/Sao_Paulo),
// disparado pelo cron de 15 min das devoluções (sem cron novo). Guarda o envio em
// saude_alertas (chave painel_resumo:<dia>:<hora>) para não mandar duas vezes.
const BASE_URL = process.env.APP_URL || "https://ngk-autohub.vercel.app";
export const HORAS_RESUMO = [8, 14];

export function horaBRT(agora = new Date()): { dia: string; hora: number } {
  const dia = agora.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const hora = Number(agora.toLocaleString("en-US", { timeZone: "America/Sao_Paulo", hour: "2-digit", hour12: false }));
  return { dia, hora: hora === 24 ? 0 : hora };
}

export async function textoResumo(lojaIds: string[] | null): Promise<string> {
  const p = await montarPainel(lojaIds, { estoque: () => pendenciasEstoque(lojaIds), campanhas: () => pendenciasCampanhas(lojaIds) });
  const top = p.pendencias.slice(0, 5).map((x) => `• [${x.urgencia === "agora" ? "AGORA" : x.urgencia.toUpperCase()}] ${x.titulo}`).join("\n");
  return `📋 Painel do dia\nAgora: ${p.contagem.agora} · Hoje: ${p.contagem.hoje} · Amanhã: ${p.contagem.amanha}\nResolvidos hoje: ${p.resolvidosHoje}\n\n${top || "Nada pendente."}\n\n${BASE_URL}/painel`;
}

// Envia se for a hora certa e ainda não foi enviado hoje nessa hora. `forcar` ignora a hora.
export async function enviarResumoSeForHora(opts: { forcar?: boolean } = {}): Promise<{ enviado: boolean; motivo?: string }> {
  const { dia, hora } = horaBRT();
  const slot = opts.forcar ? `manual:${Date.now()}` : HORAS_RESUMO.includes(hora) ? String(hora) : null;
  if (!slot) return { enviado: false, motivo: `fora das horas ${HORAS_RESUMO.join("/")} (agora ${hora} h)` };
  const chave = `painel_resumo:${dia}:${slot}`;
  if (!opts.forcar) {
    const { data } = await supabase.from("saude_alertas").select("id").eq("chave", chave).limit(1).maybeSingle();
    if (data) return { enviado: false, motivo: "já enviado" };
  }
  const texto = await textoResumo(null);
  const ok = await enviarTelegram(texto);
  if (ok) await supabase.from("saude_alertas").insert({ loja_id: null, chave, dia, texto, enviado_em: new Date().toISOString() });
  return { enviado: ok, motivo: ok ? undefined : "Telegram não configurado" };
}
