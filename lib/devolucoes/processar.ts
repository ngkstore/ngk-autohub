import { supabase } from "@/lib/supabase";
import { enviarTelegram } from "@/lib/telegram";
import { configDevolucoes, contaDaLoja } from "@/lib/devolucoes/config";
import { getFlagConta } from "@/lib/flags";
import { avaliarRegras, type ContextoCaso, type Regra } from "@/lib/devolucoes/regras";
import { sugerir, type CasoAssistente, type Sugestao } from "@/lib/devolucoes/assistente";
import { atualizarRiscoCompradores, riscoDoComprador } from "@/lib/devolucoes/risco";
import { executar } from "@/lib/devolucoes/acoes";
import { acaoDaSugestao, linkCaso, pedirAprovacaoTelegram } from "@/lib/devolucoes/aprovacao";
import { prazoCritico, type Acao } from "@/lib/devolucoes/validar";
import { acompanharCreditos } from "@/lib/devolucoes/credito";

// Orquestrador do assistente (B4), chamado depois da coleta (mesmo cron de 15 min):
//  1. atualiza o risco dos compradores;
//  2. para cada caso aberto que precisa de decisão e ainda não tem sugestão (ou mudou):
//     regras em ordem → senão assistente → modo da regra/limites decidem se executa,
//     pede aprovação no Telegram ou só sugere;
//  3. alertas de prazo (< N h), tarefa de inspeção (chegou), cobrança de crédito.
type Linha = CasoAssistente & { sugestao: Sugestao | null; prazo_prova: string | null; resultado: string | null; compensacao_status: string | null; credito_status: string | null; creditado_em: string | null; atualizado_em: string; plataforma_atualizado_em: string | null };

const ETAPAS_DECISAO = ["resposta", "decisao", "recebido", "inspecao"];

async function regrasDaConta(contaId: string | null): Promise<Regra[]> {
  const { data } = await supabase.from("regras_devolucao").select("id, ordem, ativa, nome, condicao, acao, modo").or(contaId ? `conta_id.eq.${contaId},conta_id.is.null` : "conta_id.is.null").order("ordem");
  return (data || []) as Regra[];
}

async function contextoRegras(c: Linha): Promise<ContextoCaso> {
  const [{ data: insp }, risco, { data: evEntrega }] = await Promise.all([
    supabase.from("devolucao_inspecoes").select("peso_envio_kg, peso_chegada_kg, estado").eq("devolucao_id", c.id).order("criado_em", { ascending: false }).limit(1).maybeSingle(),
    riscoDoComprador(c.canal, c.comprador_id),
    supabase.from("devolucao_midias").select("id").eq("devolucao_id", c.id).eq("origem", "nos").ilike("legenda", "%entrega%").limit(1).maybeSingle(),
  ]);
  const ganhaEm = c.resultado === "ganha" ? c.plataforma_atualizado_em : null;
  return {
    canal: c.canal,
    tipo: c.tipo,
    etapa: c.etapa,
    motivo: c.motivo_codigo,
    valor: Number(c.valor_reembolso_pedido || 0),
    prazoResposta: c.prazo_resposta,
    chegou: !!c.chegou_em,
    lacrado: insp?.estado === "novo" ? true : insp?.estado ? false : null,
    pesoEnvioKg: insp?.peso_envio_kg == null ? null : Number(insp.peso_envio_kg),
    pesoChegadaKg: insp?.peso_chegada_kg == null ? null : Number(insp.peso_chegada_kg),
    itemDiferente: insp?.estado === "diferente_ou_faltando" ? true : insp?.estado ? false : null,
    entregaConfirmadaComFoto: !!evEntrega,
    suspeito: risco.suspeito,
    devolucoes90d: risco.devolucoes_90d,
    disputaGanhaEm: ganhaEm,
    creditoStatus: c.credito_status,
  };
}

async function somaAutomaticaHoje(lojaId: string): Promise<number> {
  const inicio = new Date();
  inicio.setHours(0, 0, 0, 0);
  const { data } = await supabase
    .from("devolucao_aprovacoes")
    .select("acao, devolucoes!inner(loja_id, valor_reembolso_pedido)")
    .eq("devolucoes.loja_id", lojaId)
    .eq("via", "tela")
    .is("decidido_por", null)
    .not("executada_em", "is", null)
    .gte("executada_em", inicio.toISOString());
  let soma = 0;
  for (const a of data || []) {
    const acao = a.acao as Acao;
    const dev = a.devolucoes as unknown as { valor_reembolso_pedido: number | null };
    if (acao?.tipo === "aprovar") soma += Number(dev?.valor_reembolso_pedido || 0);
  }
  return soma;
}

async function jaAlertou(devolucaoId: string, chave: string): Promise<boolean> {
  const { data } = await supabase.from("devolucao_eventos").select("id").eq("devolucao_id", devolucaoId).eq("chave", chave).maybeSingle();
  return !!data;
}

async function registrar(devolucaoId: string, tipo: string, descricao: string, chave: string, origem = "sistema") {
  await supabase.from("devolucao_eventos").upsert({ devolucao_id: devolucaoId, origem, tipo, descricao, chave }, { onConflict: "devolucao_id,chave", ignoreDuplicates: true });
}

export async function processarDevolucoes(opts: { lojaId?: string; orcamentoMs?: number; maxSugestoes?: number } = {}) {
  const inicio = Date.now();
  const estourou = () => !!opts.orcamentoMs && Date.now() - inicio > opts.orcamentoMs;
  const r = { casos: 0, sugestoes: 0, regras: 0, executadas: 0, aprovacoes_pedidas: 0, alertas: 0, inspecoes: 0, erros: 0, ultimo_erro: undefined as string | undefined };

  const cfgPorConta = new Map<string, Awaited<ReturnType<typeof configDevolucoes>>>();
  const modoPorConta = new Map<string, "sugerir" | "aprovar">(); // modo do assistente (Regras e assistente)
  const regrasPorConta = new Map<string, Regra[]>();
  const contaPorLoja = new Map<string, string | null>();
  const cfgDe = async (lojaId: string) => {
    if (!contaPorLoja.has(lojaId)) contaPorLoja.set(lojaId, await contaDaLoja(lojaId));
    const conta = contaPorLoja.get(lojaId) || "";
    if (!cfgPorConta.has(conta)) cfgPorConta.set(conta, await configDevolucoes(conta));
    if (!regrasPorConta.has(conta)) regrasPorConta.set(conta, await regrasDaConta(conta || null));
    if (!modoPorConta.has(conta)) modoPorConta.set(conta, conta && (await getFlagConta("devolucoes_modo_assistente", conta)) ? "aprovar" : "sugerir");
    return { conta, cfg: cfgPorConta.get(conta)!, regras: regrasPorConta.get(conta)!, modo: modoPorConta.get(conta)! };
  };

  // 1. risco (limite da primeira conta; as contas usam o mesmo padrão)
  try {
    const primeira = (await supabase.from("lojas").select("id").limit(1).maybeSingle()).data?.id as string | undefined;
    const lim = primeira ? (await cfgDe(primeira)).cfg.limites.suspeito_devolucoes_90d : 3;
    await atualizarRiscoCompradores(lim);
  } catch (e) {
    r.erros++;
    r.ultimo_erro = e instanceof Error ? e.message : String(e);
  }

  // 2. casos abertos
  let q = supabase
    .from("devolucoes")
    .select("id, loja_id, canal, pedido_id, plataforma_id, tipo, etapa, status_plataforma, motivo_codigo, motivo_texto, texto_comprador, valor_pedido, valor_reembolso_pedido, prazo_resposta, prazo_prova, chegou_em, comprador_usuario, comprador_id, itens, disputa_status, sugestao, resultado, compensacao_status, credito_status, creditado_em, atualizado_em, plataforma_atualizado_em")
    .neq("etapa", "encerrado")
    .order("prazo_resposta", { ascending: true, nullsFirst: false })
    .limit(300);
  if (opts.lojaId) q = q.eq("loja_id", opts.lojaId);
  const { data } = await q;
  let sugestoesFeitas = 0;

  for (const c of (data || []) as Linha[]) {
    if (estourou()) break;
    r.casos++;
    try {
      const { cfg, regras, modo } = await cfgDe(c.loja_id);
      const ctx = await contextoRegras(c);

      // 3a. prazo crítico → alerta (uma vez por prazo)
      if (c.prazo_resposta && prazoCritico(c.prazo_resposta, cfg.limites.alerta_horas) && new Date(c.prazo_resposta) > new Date()) {
        const chave = `alerta_prazo:${c.prazo_resposta}`;
        if (!(await jaAlertou(c.id, chave))) {
          await enviarTelegram(`⏰ Devolução ${c.plataforma_id} (${c.canal}) vence em menos de ${cfg.limites.alerta_horas} h: ${c.motivo_codigo ?? "-"} · R$ ${Number(c.valor_reembolso_pedido || 0).toFixed(2)}\n${linkCaso(c.id)}`);
          await registrar(c.id, "alerta_prazo", `Alerta de prazo enviado (< ${cfg.limites.alerta_horas} h)`, chave);
          r.alertas++;
        }
      }
      // 3b. chegou → tarefa de inspeção
      if (c.chegou_em && (c.etapa === "voltando" || c.etapa === "recebido")) {
        const chave = "tarefa_inspecao";
        if (!(await jaAlertou(c.id, chave))) {
          await supabase.from("devolucoes").update({ etapa: "recebido" }).eq("id", c.id);
          await registrar(c.id, "tarefa_inspecao", "Pacote chegou: inspecionar em até 24 h (Devoluções → Recebimento)", chave);
          r.inspecoes++;
        }
      }

      // 4. decisão: regras → assistente
      if (!ETAPAS_DECISAO.includes(c.etapa)) continue;
      const regra = avaliarRegras(regras, ctx);
      const mudou = !c.sugestao || (c.plataforma_atualizado_em && c.sugestao.gerada_em < c.plataforma_atualizado_em);

      if (regra) {
        r.regras++;
        const a = regra.acao;
        const chaveRegra = `regra:${regra.id}:${c.plataforma_atualizado_em ?? ""}`;
        if (await jaAlertou(c.id, chaveRegra)) continue;
        if (a.tipo === "alerta") {
          await enviarTelegram(`⚠️ ${regra.nome}: devolução ${c.plataforma_id} (${c.canal})\n${linkCaso(c.id)}`);
          await registrar(c.id, "regra", `Regra "${regra.nome}" disparou alerta`, chaveRegra);
          r.alertas++;
          continue;
        }
        if (a.tipo === "tarefa_inspecao" || a.tipo === "marcar_suspeito") {
          await registrar(c.id, "regra", `Regra "${regra.nome}" aplicada`, chaveRegra);
          continue;
        }
        if (a.tipo === "cobrar_credito") continue; // B6 cuida
        const acao: Acao = { tipo: a.tipo as Acao["tipo"], motivo_plataforma: a.motivo_plataforma ?? null, texto: a.mensagem ?? null, valor_parcial: a.valor_parcial_pct ? Math.round(Number(c.valor_reembolso_pedido || 0) * a.valor_parcial_pct) / 100 : null };
        await supabase.from("devolucoes").update({ regra_id: regra.id }).eq("id", c.id);
        await supabase.from("regras_devolucao").update({ usos: (await supabase.from("regras_devolucao").select("usos").eq("id", regra.id).single()).data?.usos + 1 || 1 }).eq("id", regra.id);
        if (regra.modo === "automatico" && cfg.acoes_api) {
          const res = await executar({ id: c.id, loja_id: c.loja_id, canal: c.canal, plataforma_id: c.plataforma_id, pedido_id: c.pedido_id, valor_reembolso_pedido: c.valor_reembolso_pedido, comprador_id: c.comprador_id }, acao, { modo: "automatico", somaAutomaticaHoje: await somaAutomaticaHoje(c.loja_id), compradorSuspeito: ctx.suspeito });
          if (res.enviado) r.executadas++;
          else if (res.precisaAprovacao) {
            await pedirAprovacaoTelegram(c, acao, "regra", regra.nome);
            r.aprovacoes_pedidas++;
          }
        } else if (regra.modo === "aprovar" || (regra.modo === "automatico" && !cfg.acoes_api)) {
          await pedirAprovacaoTelegram(c, acao, "regra", regra.nome);
          r.aprovacoes_pedidas++;
        }
        await registrar(c.id, "regra", `Regra "${regra.nome}" → ${acao.tipo} (${regra.modo})`, chaveRegra);
        continue;
      }

      // assistente (só quando não há sugestão ou o caso mudou), com teto por rodada
      if (mudou && sugestoesFeitas < (opts.maxSugestoes ?? 10)) {
        const s = await sugerir(c);
        sugestoesFeitas++;
        r.sugestoes++;
        // Modo "pedir aprovação": sugestão com confiança alta/média (não "aguardar") vai ao Telegram.
        // Modo "só sugerir" (padrão): fica na fila e no caso.
        if (modo === "aprovar" && s.decisao !== "aguardar" && s.confianca !== "baixa" && (c.etapa === "resposta" || c.etapa === "decisao")) {
          await pedirAprovacaoTelegram({ ...c, sugestao: s }, acaoDaSugestao(s), "assistente");
          r.aprovacoes_pedidas++;
        }
      }
    } catch (e) {
      r.erros++;
      r.ultimo_erro = e instanceof Error ? e.message : String(e);
    }
  }
  // B6: disputas ganhas → crédito na conta (ou cobrança)
  let credito: Awaited<ReturnType<typeof acompanharCreditos>> | null = null;
  if (!estourou()) {
    try {
      credito = await acompanharCreditos({ lojaId: opts.lojaId, creditoDias: cfgPorConta.values().next().value?.limites.credito_dias ?? 3 });
    } catch (e) {
      r.erros++;
      r.ultimo_erro = e instanceof Error ? e.message : String(e);
    }
  }
  return { ...r, credito, segundos: Math.round((Date.now() - inicio) / 1000) };
}
