import { supabase } from "@/lib/supabase";
import { enviarTelegram } from "@/lib/telegram";
import { linkCaso } from "@/lib/devolucoes/aprovacao";

// B6 — disputas e crédito na conta. Quando a plataforma decide a favor do vendedor,
// o crédito tem de aparecer: Shopee em carteira_transacoes (mesmo order_sn, valor
// positivo, depois da decisão); TikTok em tiktok_transacoes (mesmo order_id).
// PONTO ABERTO: ainda não sabemos o transaction_type da Shopee para o crédito de
// disputa; aceita qualquer crédito positivo ligado ao pedido e registra o tipo
// encontrado como candidato (evento "credito_candidato").
type Dev = { id: string; loja_id: string; canal: "shopee" | "tiktok"; pedido_id: string; plataforma_id: string; resultado: string | null; compensacao_status: string | null; valor_reembolso_pedido: number | null; valor_recuperado: number | null; credito_status: string | null; credito_esperado_ate: string | null; plataforma_atualizado_em: string | null };

const ganhou = (d: Dev) => d.resultado === "ganha" || /ACCEPT|APPROV|SUCCESS/i.test(d.compensacao_status || "");

export async function procurarCredito(d: Dev): Promise<{ achou: boolean; ref?: string; valor?: number; tipo?: string; quando?: string }> {
  const desde = d.plataforma_atualizado_em ? new Date(new Date(d.plataforma_atualizado_em).getTime() - 2 * 86400000).toISOString() : new Date(Date.now() - 30 * 86400000).toISOString();
  if (d.canal === "shopee") {
    const { data } = await supabase
      .from("carteira_transacoes")
      .select("transaction_id, tipo, valor, criado_em, descricao")
      .eq("loja_id", d.loja_id)
      .eq("order_sn", d.pedido_id)
      .gt("valor", 0)
      .gte("criado_em", desde)
      .order("criado_em", { ascending: false })
      .limit(5);
    const t = (data || []).find((x) => !/ESCROW_VERIFIED_ADD|FAST_ESCROW/i.test(String(x.tipo || ""))) || (data || [])[0];
    if (t) return { achou: true, ref: t.transaction_id, valor: Number(t.valor), tipo: t.tipo ?? undefined, quando: t.criado_em ?? undefined };
    return { achou: false };
  }
  const { data } = await supabase
    .from("tiktok_transacoes")
    .select("id, tipo, adjustment, settlement, order_create_time")
    .eq("loja_id", d.loja_id)
    .eq("order_id", d.pedido_id)
    .gt("adjustment", 0)
    .limit(5);
  const t = (data || [])[0];
  if (t) return { achou: true, ref: t.id, valor: Number(t.adjustment), tipo: t.tipo ?? undefined };
  return { achou: false };
}

export async function acompanharCreditos(opts: { lojaId?: string; creditoDias?: number } = {}): Promise<{ verificadas: number; creditadas: number; cobrancas: number }> {
  const r = { verificadas: 0, creditadas: 0, cobrancas: 0 };
  let q = supabase
    .from("devolucoes")
    .select("id, loja_id, canal, pedido_id, plataforma_id, resultado, compensacao_status, valor_reembolso_pedido, valor_recuperado, credito_status, credito_esperado_ate, plataforma_atualizado_em")
    .in("credito_status", ["aguardando", "nao_creditado", "nao_se_aplica"])
    .limit(500);
  if (opts.lojaId) q = q.eq("loja_id", opts.lojaId);
  const { data } = await q;
  const dias = opts.creditoDias ?? 3;
  for (const d of (data || []) as Dev[]) {
    if (!ganhou(d)) continue;
    r.verificadas++;
    // ganhou e ainda estava "nao_se_aplica": passa a aguardar (decisão + N dias)
    if (d.credito_status === "nao_se_aplica" || !d.credito_esperado_ate) {
      const base = d.plataforma_atualizado_em ? new Date(d.plataforma_atualizado_em) : new Date();
      const ate = new Date(base.getTime() + dias * 86400000).toISOString().slice(0, 10);
      await supabase.from("devolucoes").update({ credito_status: "aguardando", credito_esperado_ate: ate, resultado: d.resultado ?? "ganha" }).eq("id", d.id);
      d.credito_status = "aguardando";
      d.credito_esperado_ate = ate;
    }
    const c = await procurarCredito(d);
    if (c.achou) {
      await supabase.from("devolucoes").update({ credito_status: "creditado", credito_transacao_ref: c.ref, creditado_em: c.quando ?? new Date().toISOString(), valor_recuperado: d.valor_recuperado ?? c.valor ?? null }).eq("id", d.id);
      await supabase.from("devolucao_eventos").upsert({ devolucao_id: d.id, origem: "sistema", tipo: "credito_candidato", descricao: `Crédito encontrado: ${c.tipo ?? "?"} R$ ${Number(c.valor || 0).toFixed(2)} (ref ${c.ref}). Tipo candidato para carteira_categorias.`, dados: c, chave: `credito:${c.ref}` }, { onConflict: "devolucao_id,chave", ignoreDuplicates: true });
      r.creditadas++;
      continue;
    }
    if (d.credito_status === "aguardando" && d.credito_esperado_ate && d.credito_esperado_ate < new Date().toISOString().slice(0, 10)) {
      await supabase.from("devolucoes").update({ credito_status: "nao_creditado" }).eq("id", d.id);
      const { data: ja } = await supabase.from("devolucao_eventos").select("id").eq("devolucao_id", d.id).eq("chave", "cobranca").maybeSingle();
      if (!ja) {
        await enviarTelegram(`💸 Disputa ganha sem crédito: ${d.canal} ${d.plataforma_id} · pedido ${d.pedido_id} · R$ ${Number(d.valor_reembolso_pedido || 0).toFixed(2)}\nTexto de cobrança pronto no caso: ${linkCaso(d.id)}`);
        await supabase.from("devolucao_eventos").insert({ devolucao_id: d.id, origem: "sistema", tipo: "cobranca", descricao: `Sem crédito até ${d.credito_esperado_ate}: alerta enviado`, chave: "cobranca" });
        r.cobrancas++;
      }
    }
  }
  return r;
}

export function textoCobranca(d: { canal: string; pedido_id: string; plataforma_id: string; plataforma_atualizado_em: string | null; valor_reembolso_pedido: number | null; valor_recuperado: number | null }) {
  const data = d.plataforma_atualizado_em ? new Date(d.plataforma_atualizado_em).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "-";
  const valor = Number(d.valor_recuperado ?? d.valor_reembolso_pedido ?? 0).toFixed(2).replace(".", ",");
  const plat = d.canal === "tiktok" ? "TikTok Shop" : "Shopee";
  return `Olá. A disputa da devolução ${d.plataforma_id}, referente ao pedido ${d.pedido_id}, foi decidida a favor da loja em ${data}, com compensação de R$ ${valor}. Até o momento o valor não foi creditado na carteira da loja. Solicito a verificação e o crédito do valor, com o número da transação correspondente. Obrigado.\n\n(${plat} · pedido ${d.pedido_id} · decisão ${data} · R$ ${valor})`;
}

// Taxa de vitória por motivo e por tipo de prova (para a tela e para o assistente).
export async function taxaVitoria(lojaIds: string[] | null) {
  let q = supabase.from("devolucoes").select("id, motivo_codigo, resultado, disputa_status, compensacao_status, valor_recuperado, valor_reembolso_pedido").in("resultado", ["ganha", "perdida"]).limit(2000);
  if (lojaIds) q = q.in("loja_id", lojaIds);
  const { data } = await q;
  const porMotivo = new Map<string, { total: number; ganhas: number }>();
  for (const d of data || []) {
    const k = d.motivo_codigo || "-";
    const m = porMotivo.get(k) || { total: 0, ganhas: 0 };
    m.total++;
    if (d.resultado === "ganha") m.ganhas++;
    porMotivo.set(k, m);
  }
  const ids = (data || []).map((d) => d.id);
  const porProva = new Map<string, { total: number; ganhas: number }>();
  if (ids.length) {
    const { data: midias } = await supabase.from("devolucao_midias").select("devolucao_id, tipo").eq("origem", "nos").in("devolucao_id", ids);
    const tiposPorDev = new Map<string, Set<string>>();
    for (const m of midias || []) {
      const s = tiposPorDev.get(m.devolucao_id) || new Set<string>();
      s.add(m.tipo);
      tiposPorDev.set(m.devolucao_id, s);
    }
    for (const d of data || []) {
      const tipos = tiposPorDev.get(d.id);
      const k = tipos?.has("quadro") ? "vídeo de abertura (quadros)" : tipos?.has("foto") ? "fotos" : "sem prova";
      const p = porProva.get(k) || { total: 0, ganhas: 0 };
      p.total++;
      if (d.resultado === "ganha") p.ganhas++;
      porProva.set(k, p);
    }
  }
  const lista = (m: Map<string, { total: number; ganhas: number }>) => [...m.entries()].map(([k, v]) => ({ chave: k, total: v.total, ganhas: v.ganhas, pct: v.total ? Math.round((v.ganhas / v.total) * 100) : 0 })).sort((a, b) => b.total - a.total);
  return { porMotivo: lista(porMotivo), porProva: lista(porProva) };
}
