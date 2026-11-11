// F3 — margem no preço da campanha (puro, testável). Não é a precificação completa:
// é só para não entrar em campanha com prejuízo.
//   margem = preço_campanha − comissão − taxa de serviço média − afiliado − frete médio − imposto − custo
export type EntradaMargem = {
  canal: "shopee" | "tiktok";
  precoCampanha: number;
  comissaoShopee?: number | null; // já calculada por shopee_taxa_esperada_item(preco, dia) (R$)
  taxaServicoPct: number; // média do item/loja nos últimos 60 dias, em % do preço
  afiliadoPct: number; // taxa da campanha AMS / do TikTok, em %
  freteMedio: number; // R$ pago pelo vendedor por pedido
  impostoPct: number; // % sobre o preço
  custo: number | null; // custo médio (UpSeller) ou custos_variacao
};

/** Comissão TikTok Shop (BR, 2026): 10% + R$ 4 abaixo de R$ 50; 6% + R$ 6 a partir de R$ 50. */
export function comissaoTikTok(preco: number): number {
  if (preco <= 0) return 0;
  return preco < 50 ? round(preco * 0.1 + 4) : round(preco * 0.06 + 6);
}

export type ResultadoMargem = { margem: number | null; pct: number | null; comissao: number; taxaServico: number; afiliado: number; frete: number; imposto: number; custo: number | null; avisos: string[] };

export function margemCampanha(e: EntradaMargem): ResultadoMargem {
  const p = Number(e.precoCampanha) || 0;
  const avisos: string[] = [];
  const comissao = e.canal === "tiktok" ? comissaoTikTok(p) : Number(e.comissaoShopee ?? NaN);
  if (!Number.isFinite(comissao)) avisos.push("sem comissão Shopee calculada");
  const taxaServico = round(p * (Number(e.taxaServicoPct) || 0) / 100);
  const afiliado = round(p * (Number(e.afiliadoPct) || 0) / 100);
  const frete = round(Number(e.freteMedio) || 0);
  const imposto = round(p * (Number(e.impostoPct) || 0) / 100);
  if (e.custo === null || e.custo === undefined) avisos.push("sem custo cadastrado");
  const custo = e.custo === null || e.custo === undefined ? null : Number(e.custo);
  if (custo === null || !Number.isFinite(comissao)) return { margem: null, pct: null, comissao: Number.isFinite(comissao) ? comissao : 0, taxaServico, afiliado, frete, imposto, custo, avisos };
  const margem = round(p - comissao - taxaServico - afiliado - frete - imposto - custo);
  return { margem, pct: p > 0 ? round((margem / p) * 100) : null, comissao, taxaServico, afiliado, frete, imposto, custo, avisos };
}

const round = (v: number) => Math.round(v * 100) / 100;
