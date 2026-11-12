import { supabase } from "@/lib/supabase";
import { lojasTikTokAtivas, type LojaTikTok } from "@/lib/tiktok/lojas";
import { detalheReturnShopee, eventosShopee, JANELA_SHOPEE_DIAS, listarReturnsShopee, mapearDevolucaoShopee, midiasShopee } from "@/lib/shopee/devolucoes";
import { buscarReturnTikTok, eventosTikTok, listarCancelamentosTikTok, listarReturnsTikTok, mapearCancelamentoTikTok, mapearDevolucaoTikTok, recordsTikTok } from "@/lib/tiktok/devolucoes";
import { guardarMidiasComprador } from "@/lib/devolucoes/midias";
import type { DevolucaoLinha, EventoLinha, MidiaComprador } from "@/lib/devolucoes/tipos";

type J = Record<string, unknown>;
export type ResultadoSync = { canal: "shopee" | "tiktok"; loja_id: string; vistos: number; gravados: number; eventos: number; midias: number; erros: number; ultimo_erro?: string; segundos: number };

const DIAS_CARGA_INICIAL = 90;
const FOLGA_HORAS = 24; // relê o que mudou nas últimas 24 h além da marca d'água

// Grava (upsert) a linha, os eventos novos e as mídias do comprador.
export async function gravarDevolucao(linha: DevolucaoLinha, eventos: EventoLinha[], midias: MidiaComprador[]) {
  const { data: anterior } = await supabase
    .from("devolucoes")
    .select("id, etapa, status_plataforma, chegou_em, sugestao, regra_id, credito_status, credito_esperado_ate, valor_recuperado")
    .eq("canal", linha.canal)
    .eq("plataforma_id", linha.plataforma_id)
    .maybeSingle();
  if (anterior?.chegou_em && !linha.chegou_em) linha.chegou_em = anterior.chegou_em; // nunca "desconfirma" a chegada
  if (anterior?.chegou_em && linha.chegou_em !== anterior.chegou_em) linha.chegou_em = anterior.chegou_em;
  // Equipe já marcou inspeção? Não volta a etapa para trás.
  // a equipe já está inspecionando: a plataforma não volta o caso para trânsito/resposta/validar
  if (anterior && anterior.etapa === "inspecao" && (linha.etapa === "voltando" || linha.etapa === "coleta" || linha.etapa === "resposta" || linha.etapa === "validar" || linha.etapa === "recebido")) linha.etapa = anterior.etapa;
  if (anterior && anterior.etapa === "recebido" && (linha.etapa === "voltando" || linha.etapa === "coleta" || linha.etapa === "resposta")) linha.etapa = anterior.etapa;

  const { data: salvo, error } = await supabase
    .from("devolucoes")
    .upsert(linha, { onConflict: "canal,plataforma_id" })
    .select("id")
    .single();
  if (error || !salvo) throw new Error(`devolucoes upsert ${linha.plataforma_id}: ${error?.message}`);
  const id = salvo.id as string;

  // Mudança de etapa/status vira evento do sistema.
  const extras: EventoLinha[] = [];
  if (anterior && anterior.status_plataforma !== linha.status_plataforma && linha.status_plataforma) {
    extras.push({ quando: new Date().toISOString(), origem: "sistema", tipo: "mudou_status", descricao: `${anterior.status_plataforma ?? "-"} → ${linha.status_plataforma}`, chave: `mudou:${linha.status_plataforma}:${linha.plataforma_atualizado_em ?? ""}` });
  }
  let nEventos = 0;
  const lote = [...eventos, ...extras].map((e) => ({ devolucao_id: id, quando: e.quando, origem: e.origem, tipo: e.tipo, descricao: e.descricao, dados: e.dados ?? null, chave: e.chave }));
  if (lote.length > 0) {
    const { data: ins } = await supabase.from("devolucao_eventos").upsert(lote, { onConflict: "devolucao_id,chave", ignoreDuplicates: true }).select("id");
    nEventos = ins?.length ?? 0;
  }
  const m = await guardarMidiasComprador(id, midias);
  return { id, eventos: nEventos, midias: m.novas, novo: !anterior };
}

// plataforma_id -> plataforma_atualizado_em (para pular o que não mudou)
async function jaGravados(lojaId: string, canal: "shopee" | "tiktok"): Promise<Map<string, string | null>> {
  const { data } = await supabase.from("devolucoes").select("plataforma_id, plataforma_atualizado_em").eq("loja_id", lojaId).eq("canal", canal);
  return new Map((data || []).map((d) => [String(d.plataforma_id), d.plataforma_atualizado_em as string | null]));
}

async function marcaDagua(lojaId: string, canal: "shopee" | "tiktok"): Promise<Date | null> {
  const { data } = await supabase
    .from("devolucoes")
    .select("plataforma_atualizado_em")
    .eq("loja_id", lojaId)
    .eq("canal", canal)
    .order("plataforma_atualizado_em", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.plataforma_atualizado_em ? new Date(data.plataforma_atualizado_em) : null;
}

// Reprocessa etapa/prazo dos casos abertos a partir do bruto já gravado (sem chamar a API):
// usado quando a regra de etapas muda e o update_time na plataforma não mudou.
export async function reprocessarEtapasShopee(lojaId?: string): Promise<{ lidos: number; alterados: number }> {
  let q = supabase.from("devolucoes").select("id, loja_id, etapa, prazo_resposta, bruto").eq("canal", "shopee").neq("etapa", "encerrado").limit(5000);
  if (lojaId) q = q.eq("loja_id", lojaId);
  const { data } = await q;
  let alterados = 0;
  for (const d of (data || []) as { id: string; loja_id: string; etapa: string; prazo_resposta: string | null; bruto: Record<string, unknown> | null }[]) {
    if (!d.bruto || !d.bruto.status) continue;
    const linha = mapearDevolucaoShopee(d.bruto, d.loja_id);
    if (d.etapa === "inspecao" || d.etapa === "recebido") continue; // etapas da equipe não voltam
    if (linha.etapa === d.etapa && (linha.prazo_resposta ?? null) === (d.prazo_resposta ?? null)) continue;
    const { error } = await supabase.from("devolucoes").update({ etapa: linha.etapa, prazo_resposta: linha.prazo_resposta, atualizado_em: new Date().toISOString() }).eq("id", d.id);
    if (!error) alterados++;
  }
  return { lidos: (data || []).length, alterados };
}

// ---- Shopee: uma loja ----
export async function sincronizarDevolucoesShopeeLoja(lojaId: string, opts: { dias?: number; orcamentoMs?: number; forcar?: boolean } = {}): Promise<ResultadoSync> {
  const inicio = Date.now();
  const r: ResultadoSync = { canal: "shopee", loja_id: lojaId, vistos: 0, gravados: 0, eventos: 0, midias: 0, erros: 0, segundos: 0 };
  const marca = await marcaDagua(lojaId, "shopee");
  const agora = Math.floor(Date.now() / 1000);
  let de: number;
  let campo: "create_time" | "update_time";
  if (opts.dias) {
    de = agora - opts.dias * 86400;
    campo = "create_time";
  } else if (marca) {
    de = Math.floor(marca.getTime() / 1000) - FOLGA_HORAS * 3600;
    campo = "update_time";
  } else {
    de = agora - DIAS_CARGA_INICIAL * 86400;
    campo = "create_time";
  }
  const vistos = new Set<string>();
  const gravados = await jaGravados(lojaId, "shopee");
  try {
    // janelas de no máximo 15 dias (limite da API), da mais recente para a mais antiga
    for (let ate = agora; ate > de; ate -= JANELA_SHOPEE_DIAS * 86400) {
      if (opts.orcamentoMs && Date.now() - inicio > opts.orcamentoMs) break;
      const lista = await listarReturnsShopee(lojaId, campo, Math.max(de, ate - JANELA_SHOPEE_DIAS * 86400 + 1), ate);
      for (const item of lista) {
        const sn = String(item.return_sn || "");
        if (!sn || vistos.has(sn)) continue;
        vistos.add(sn);
        if (opts.orcamentoMs && Date.now() - inicio > opts.orcamentoMs) break;
        r.vistos++;
        const upd = Number(item.update_time) > 0 ? new Date(Number(item.update_time) * 1000).toISOString() : null;
        if (!opts.forcar && upd && gravados.get(sn) === upd) continue; // nada mudou desde a última coleta
        try {
          const d = (await detalheReturnShopee(lojaId, sn)) || item;
          const g = await gravarDevolucao(mapearDevolucaoShopee(d, lojaId), eventosShopee(d), midiasShopee(d));
          r.gravados++;
          r.eventos += g.eventos;
          r.midias += g.midias;
        } catch (e) {
          r.erros++;
          r.ultimo_erro = e instanceof Error ? e.message : String(e);
        }
      }
    }
  } catch (e) {
    r.erros++;
    r.ultimo_erro = e instanceof Error ? e.message : String(e);
  }
  r.segundos = Math.round((Date.now() - inicio) / 1000);
  return r;
}

// ---- TikTok: uma loja ----
export async function sincronizarDevolucoesTikTokLoja(loja: LojaTikTok, opts: { dias?: number; orcamentoMs?: number; forcar?: boolean } = {}): Promise<ResultadoSync> {
  const inicio = Date.now();
  const r: ResultadoSync = { canal: "tiktok", loja_id: loja.lojaId, vistos: 0, gravados: 0, eventos: 0, midias: 0, erros: 0, segundos: 0 };
  const marca = await marcaDagua(loja.lojaId, "tiktok");
  const agora = Math.floor(Date.now() / 1000);
  const desde = opts.dias ? agora - opts.dias * 86400 : marca ? Math.floor(marca.getTime() / 1000) - FOLGA_HORAS * 3600 : agora - DIAS_CARGA_INICIAL * 86400;
  const gravados = await jaGravados(loja.lojaId, "tiktok");
  try {
    // sequencial: o TikTok limita a taxa por API (36009002)
    const returns = await listarReturnsTikTok(loja, desde);
    const cancelamentos = await listarCancelamentosTikTok(loja, desde);
    for (const ro of returns) {
      if (opts.orcamentoMs && Date.now() - inicio > opts.orcamentoMs) break;
      r.vistos++;
      const upd = Number(ro.update_time) > 0 ? new Date(Number(ro.update_time) * 1000).toISOString() : null;
      if (!opts.forcar && upd && gravados.get(String(ro.return_id)) === upd) continue;
      try {
        const records = await recordsTikTok(loja, String(ro.return_id));
        const { eventos, midias } = eventosTikTok(records);
        const g = await gravarDevolucao(mapearDevolucaoTikTok(ro, loja.lojaId), eventos, midias);
        r.gravados++;
        r.eventos += g.eventos;
        r.midias += g.midias;
      } catch (e) {
        r.erros++;
        r.ultimo_erro = e instanceof Error ? e.message : String(e);
      }
    }
    for (const c of cancelamentos) {
      if (opts.orcamentoMs && Date.now() - inicio > opts.orcamentoMs) break;
      r.vistos++;
      try {
        const g = await gravarDevolucao(mapearCancelamentoTikTok(c, loja.lojaId), [], []);
        r.gravados++;
        r.eventos += g.eventos;
      } catch (e) {
        r.erros++;
        r.ultimo_erro = e instanceof Error ? e.message : String(e);
      }
    }
  } catch (e) {
    r.erros++;
    r.ultimo_erro = e instanceof Error ? e.message : String(e);
  }
  r.segundos = Math.round((Date.now() - inicio) / 1000);
  return r;
}

// Ressincroniza UM caso do TikTok (webhook).
export async function ressincronizarTikTok(shopId: string, returnId: string) {
  const lojas = await lojasTikTokAtivas();
  const loja = lojas.find((l) => l.shopId === String(shopId)) || lojas[0];
  if (!loja) return { ok: false, erro: "loja TikTok sem token" };
  const ro = await buscarReturnTikTok(loja, returnId);
  if (!ro) return { ok: false, erro: "return não encontrado" };
  const records = await recordsTikTok(loja, returnId);
  const { eventos, midias } = eventosTikTok(records);
  const g = await gravarDevolucao(mapearDevolucaoTikTok(ro, loja.lojaId), eventos, midias);
  return { ok: true, ...g };
}

// Ressincroniza UM caso da Shopee (tela "atualizar").
export async function ressincronizarShopee(lojaId: string, returnSn: string) {
  const d = await detalheReturnShopee(lojaId, returnSn);
  if (!d) return { ok: false, erro: "return não encontrado" };
  const g = await gravarDevolucao(mapearDevolucaoShopee(d, lojaId), eventosShopee(d), midiasShopee(d));
  return { ok: true, ...g };
}

// Todas as lojas (cron). `canal` e `loja` opcionais.
export async function sincronizarDevolucoes(opts: { canal?: "shopee" | "tiktok"; lojaId?: string; dias?: number; orcamentoMs?: number; forcar?: boolean } = {}) {
  const inicio = Date.now();
  const resultados: ResultadoSync[] = [];
  const restante = () => (opts.orcamentoMs ? Math.max(5_000, opts.orcamentoMs - (Date.now() - inicio)) : undefined);
  if (!opts.canal || opts.canal === "shopee") {
    let q = supabase.from("marketplace_tokens").select("loja_id").eq("marketplace", "shopee").eq("status", "ativo");
    if (opts.lojaId) q = q.eq("loja_id", opts.lojaId);
    const { data } = await q;
    for (const t of data || []) {
      if (!t.loja_id) continue;
      resultados.push(await sincronizarDevolucoesShopeeLoja(String(t.loja_id), { dias: opts.dias, orcamentoMs: restante(), forcar: opts.forcar }));
      // falhas de entrega vêm da API de pedidos (não da de devoluções)
      const { sincronizarFalhasEntregaShopee } = await import("@/lib/shopee/falhasEntrega");
      resultados.push({ ...(await sincronizarFalhasEntregaShopee(String(t.loja_id), { dias: opts.dias, orcamentoMs: restante() })), canal: "shopee" });
    }
  }
  if (!opts.canal || opts.canal === "tiktok") {
    const lojas = (await lojasTikTokAtivas()).filter((l) => !opts.lojaId || l.lojaId === opts.lojaId);
    for (const l of lojas) resultados.push(await sincronizarDevolucoesTikTokLoja(l, { dias: opts.dias, orcamentoMs: restante(), forcar: opts.forcar }));
  }
  return resultados;
}

export type { J };
