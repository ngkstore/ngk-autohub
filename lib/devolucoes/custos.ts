import { supabase } from "@/lib/supabase";
import type { ItemDevolucao } from "@/lib/devolucoes/tipos";

// Custo de cada caminho (B4): repasse em risco, comissão de afiliado estornada,
// frete e custo do produto que volta (se a inspeção der OK).
export type CustoCaminhos = {
  repasse_em_risco: number; // o que a loja deixa de receber se o reembolso for total
  afiliado_estornado: number; // comissão de afiliado que a plataforma devolve
  frete_vendedor: number; // frete pago pelo vendedor no pedido (não volta)
  custo_produto: number; // custo dos itens devolvidos (volta ao estoque se OK)
  valor_reembolso: number;
  aprovar_total: number; // perde: repasse − afiliado estornado (produto volta)
  aprovar_sem_devolucao: number; // perde: repasse + produto (não volta)
  recusar_ganha: number; // perde: 0 (mantém repasse)
  fonte: { custos_pedido: boolean; tiktok: boolean; custo_itens: number };
};

const n = (v: unknown) => Number(v || 0);

async function custoItens(lojaId: string, itens: ItemDevolucao[]): Promise<{ total: number; achados: number }> {
  let total = 0;
  let achados = 0;
  for (const it of itens) {
    const skus = [it.variacao, it.sku].filter((s): s is string => !!s);
    let custo: number | null = null;
    for (const sku of skus) {
      const { data } = await supabase.from("custos_variacao").select("custo").eq("loja_id", lojaId).eq("model_sku", sku).maybeSingle();
      if (data?.custo != null) {
        custo = n(data.custo);
        break;
      }
    }
    if (custo === null && skus.length) {
      const { data } = await supabase.from("produtos").select("custo").eq("loja_id", lojaId).in("sku", skus).not("custo", "is", null).limit(1).maybeSingle();
      if (data?.custo != null) custo = n(data.custo);
    }
    if (custo !== null) {
      total += custo * (it.quantidade || 1);
      achados++;
    }
  }
  return { total, achados };
}

export async function custoCaminhos(d: { loja_id: string; canal: "shopee" | "tiktok"; pedido_id: string; valor_reembolso_pedido: number | null; itens: ItemDevolucao[] | null }): Promise<CustoCaminhos> {
  const reembolso = n(d.valor_reembolso_pedido);
  let repasse = 0;
  let afiliado = 0;
  let frete = 0;
  let temCustos = false;
  let temTikTok = false;

  if (d.canal === "shopee") {
    const { data } = await supabase.from("custos_pedido").select("campo, categoria, valor, soma").eq("loja_id", d.loja_id).eq("order_sn", d.pedido_id);
    if (data && data.length) {
      temCustos = true;
      for (const l of data) {
        if (l.campo === "repasse") repasse = n(l.valor);
        if (l.categoria === "afiliado" || l.categoria === "serv_afiliado") afiliado += Math.abs(n(l.valor));
        if (l.categoria === "frete" && l.soma) frete += n(l.valor);
      }
      frete = Math.abs(Math.min(0, frete)); // só o que o vendedor pagou
    }
  } else {
    const { data } = await supabase.from("tiktok_transacoes").select("revenue, shipping_cost, settlement, comissao_plataforma").eq("loja_id", d.loja_id).eq("order_id", d.pedido_id).eq("tipo", "ORDER");
    if (data && data.length) {
      temTikTok = true;
      for (const t of data) {
        repasse += n(t.settlement);
        frete += Math.max(0, n(t.shipping_cost));
      }
    }
  }
  if (!temCustos && !temTikTok) repasse = reembolso; // sem financeiro: assume o reembolso pedido
  const ci = await custoItens(d.loja_id, d.itens || []);
  const emRisco = Math.min(repasse, reembolso || repasse);
  return {
    repasse_em_risco: round(emRisco),
    afiliado_estornado: round(afiliado),
    frete_vendedor: round(frete),
    custo_produto: round(ci.total),
    valor_reembolso: round(reembolso),
    aprovar_total: round(Math.max(0, emRisco - afiliado)),
    aprovar_sem_devolucao: round(Math.max(0, emRisco - afiliado) + ci.total),
    recusar_ganha: 0,
    fonte: { custos_pedido: temCustos, tiktok: temTikTok, custo_itens: ci.achados },
  };
}

const round = (v: number) => Math.round(v * 100) / 100;
