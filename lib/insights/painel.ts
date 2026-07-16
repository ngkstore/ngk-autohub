// Leitura das capturas do painel da Shopee (coletor).
// Valores de dinheiro/alvo vêm em MICRO: divida por 100.000.
//   cost: 1014929            -> R$ 10,15
//   suggested_roi_two_target -> 750000 = ROAS 7,5

export const MICRO = 100000;
export function deMicro(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n / MICRO : 0;
}
function n(v: unknown): number {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
}

/* ================= /api/mydata/v3/dashboard/product-rankings =================
   O funil COMPLETO por produto (é o Business Insights inteiro). */
export type ItemPainel = {
  itemId: string;
  nome: string;
  pv: number;
  uv: number;
  ctr: number; // 0-1
  impressoes: number; // product_card_impressions
  cliques: number; // product_card_clicks
  cliquesBusca: number;
  likes: number;
  bounce: number; // 0-1
  carrinhoUnidades: number;
  carrinhoCompradores: number;
  taxaCarrinho: number; // uv_to_add_to_cart_rate (0-1)
  pedidosPagos: number;
  vendasPagas: number;
  taxaConversao: number; // paid_order_conversion_rate (0-1)
  ticket: number; // paid_sales_per_order
  recompra: number; // repeat_paid_order_rate
};

type LinhaRanking = Record<string, unknown>;

export function lerProductRankings(payload: unknown): ItemPainel[] {
  const itens = (payload as { result?: { items?: LinhaRanking[] } })?.result?.items;
  if (!Array.isArray(itens)) return [];
  return itens
    .filter((i) => i?.id)
    .map((i) => ({
      itemId: String(i.id),
      nome: String(i.name ?? ""),
      pv: n(i.pv),
      uv: n(i.uv),
      ctr: n(i.ctr),
      impressoes: n(i.product_card_impressions),
      cliques: n(i.product_card_clicks),
      cliquesBusca: n(i.search_clicks),
      likes: n(i.likes),
      bounce: n(i.bounce_rate),
      carrinhoUnidades: n(i.add_to_cart_units),
      carrinhoCompradores: n(i.add_to_cart_buyers),
      taxaCarrinho: n(i.uv_to_add_to_cart_rate),
      pedidosPagos: n(i.paid_orders),
      vendasPagas: n(i.paid_sales),
      taxaConversao: n(i.paid_order_conversion_rate),
      ticket: n(i.paid_sales_per_order),
      recompra: n(i.repeat_paid_order_rate),
    }));
}

/* ======== /api/mydata/v1/dashboard/traffic-sources/product-contribution ======
   Amarra o produto à CAMPANHA (elo que a API oficial não dá) + variações. */
export type ContribuicaoItem = {
  itemId: string;
  campanhaId: string | null;
  cliques: number;
  impressoes: number;
  variacaoCliques: number; // product_clicks_pct_diff
  variacaoVendas: number; // sales_pct_diff
};

export function lerProductContribution(payload: unknown): ContribuicaoItem[] {
  const itens = (payload as { result?: { item?: LinhaRanking[] } })?.result?.item;
  if (!Array.isArray(itens)) return [];
  return itens
    .filter((i) => i?.id)
    .map((i) => ({
      itemId: String(i.id),
      campanhaId: i.campaign_id ? String(i.campaign_id) : null,
      cliques: n(i.product_clicks),
      impressoes: n(i.product_impressions),
      variacaoCliques: n(i.product_clicks_pct_diff),
      variacaoVendas: n(i.sales_pct_diff),
    }));
}

/* ============ /api/pas/v1/diagnosis/homepage_batch_list_verdict ==============
   O veredito da PRÓPRIA Shopee por campanha + o ROAS alvo que ela sugere. */
export type VereditoShopee = {
  campanhaId: string;
  resultado: string; // good | fair | poor
  problema: string | null; // low_traffic | room_more_traffic | no_conversion
  roasAtual: number | null;
  roasSugerido: number | null;
};

export function lerVerdict(payload: unknown): VereditoShopee[] {
  const lista = (payload as { data?: { entry_list?: LinhaRanking[] } })?.data?.entry_list;
  if (!Array.isArray(lista)) return [];
  return lista
    .filter((e) => e?.campaign_id)
    .map((e) => {
      const vList = (e.verdict_list as LinhaRanking[]) || [];
      const v = vList[0];
      const inteiros = (v?.data as { integer_field?: Record<string, unknown> })
        ?.integer_field;
      const atual = inteiros?.current_roi_two_target;
      const sugerido = inteiros?.suggested_roi_two_target;
      return {
        campanhaId: String(e.campaign_id),
        resultado: String(
          (e.summary as { result?: string })?.result ?? "?"
        ),
        problema: v?.issue ? String(v.issue) : null,
        roasAtual: atual != null ? deMicro(atual) : null,
        roasSugerido: sugerido != null ? deMicro(sugerido) : null,
      };
    });
}

/* ================= /api/pas/v1/report/get_time_graph ========================
   Série (15 em 15 min) da CONTA: posição média, CPC, add-to-cart, ROAS. */
export type PontoTempo = {
  ts: number;
  avgRank: number; // A POSIÇÃO MÉDIA no leilão
  cpc: number; // R$
  custo: number; // R$
  impressoes: number;
  cliques: number;
  ctr: number;
  atc: number;
  taxaAtc: number;
  roasBroad: number;
  roasDireto: number;
};

export function lerTimeGraph(payload: unknown): PontoTempo[] {
  const lista = (payload as { data?: { report_by_time?: LinhaRanking[] } })?.data
    ?.report_by_time;
  if (!Array.isArray(lista)) return [];
  return lista
    .map((p) => {
      const m = (p.metrics as Record<string, unknown>) || {};
      return {
        ts: Number(p.key ?? 0),
        avgRank: n(m.avg_rank),
        cpc: deMicro(m.cpc),
        custo: deMicro(m.cost),
        impressoes: n(m.impression),
        cliques: n(m.click),
        ctr: n(m.ctr),
        atc: n(m.atc),
        taxaAtc: n(m.atc_rate),
        roasBroad: n(m.broad_roi),
        roasDireto: n(m.direct_roi),
      };
    })
    .filter((p) => p.ts > 0);
}

/* ===================== Diagnóstico (nosso, não copiado) ===================== */
export type VeredictoItem = {
  acao: "PAUSAR" | "CORRIGIR VITRINE" | "CORRIGIR PÁGINA" | "ESCALAR" | "MANTER";
  motivo: string;
  cor: string;
};

// Compara com a MEDIANA dos pares do mesmo ticket (comparar balança de R$17
// com panela de R$300 seria injusto).
export function diagnosticarPainel(
  i: ItemPainel,
  medianaCtr: number,
  medianaCarrinho: number
): VeredictoItem {
  const pct = (v: number) => (v * 100).toFixed(2) + "%";

  if (i.uv > 50 && i.pedidosPagos === 0) {
    return {
      acao: "PAUSAR",
      motivo: `${i.uv} visitantes e nenhuma venda.`,
      cor: "bg-red-900 text-red-300",
    };
  }
  if (medianaCtr > 0 && i.ctr < medianaCtr * 0.7 && i.impressoes > 1000) {
    return {
      acao: "CORRIGIR VITRINE",
      motivo: `CTR ${pct(i.ctr)} vs ${pct(medianaCtr)} dos pares — aparece (${i.impressoes.toLocaleString("pt-BR")} impressões) mas não clicam. Capa/título/preço.`,
      cor: "bg-amber-900 text-amber-300",
    };
  }
  if (medianaCarrinho > 0 && i.taxaCarrinho < medianaCarrinho * 0.6 && i.uv > 50) {
    return {
      acao: "CORRIGIR PÁGINA",
      motivo: `Carrinho ${pct(i.taxaCarrinho)} vs ${pct(medianaCarrinho)} dos pares — clica e não adiciona. Fotos/descrição/avaliações.`,
      cor: "bg-orange-900 text-orange-300",
    };
  }
  if (i.taxaCarrinho >= medianaCarrinho && i.pedidosPagos > 0) {
    return {
      acao: "ESCALAR",
      motivo: `Funil saudável: carrinho ${pct(i.taxaCarrinho)}, conversão ${pct(i.taxaConversao)}.`,
      cor: "bg-green-900 text-green-300",
    };
  }
  return { acao: "MANTER", motivo: "Sem gargalo evidente.", cor: "bg-slate-700 text-slate-300" };
}

export function medianaDe(valores: number[]): number {
  const v = valores.filter((x) => x > 0).sort((a, b) => a - b);
  if (!v.length) return 0;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

export function faixaTicket(t: number): string {
  if (t < 30) return "até R$30";
  if (t < 80) return "R$30–80";
  if (t < 200) return "R$80–200";
  return "R$200+";
}
