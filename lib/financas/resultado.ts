// Resultado do período (DRE) — fonte única para Finanças (Balanço) e Visão geral.
// Entrada: o JSON de `resumo_financas` e o de `resumo_cmv`. Puro e testável.
export type ResumoFinancas = Record<string, unknown>;

export type Resultado = {
  receita: number; // receita bruta (pedidos pagos: merchant_subtotal na Shopee)
  taxas: number; // taxas do marketplace SEM a taxa de serviço de afiliado
  taxaServAfiliado: number;
  cupom: number; // cupom próprio
  afiliado: number; // comissão de afiliado
  liquida: number; // receita líquida LIQUIDADA (escrow / extrato)
  liquidaEstimada: number; // receita líquida ESTIMADA dos pedidos ainda sem extrato/escrow (taxas esperadas)
  liquidaTotal: number; // liquidada + estimada — é a que entra no resultado
  qtdLiquidados: number;
  qtdEstimados: number;
  ads: number;
  reemb: number;
  imposto: number;
  freteCusto: number;
  reembTiktok: number;
  acelera: number;
  estornos: number;
  compens: number;
  difal: number;
  ajustes: number;
  afilAjuste: number;
  extrasCarteira: number;
  resultado: number; // resultado antes do CMV
  margem: number; // % sobre a receita
  cmv: number;
  itensTotal: number;
  itensComCusto: number;
  cobertura: number; // % de itens com custo cadastrado
  lucro: number; // resultado − CMV
  margemLucro: number;
};

const n = (v: unknown) => Number(v || 0);

export function calcularResultado(r: ResumoFinancas | null | undefined, c: ResumoFinancas | null | undefined): Resultado {
  r = r || {};
  c = c || {};
  const receita = n(r.receita_bruta);
  const taxaServAfiliado = Math.abs(n(r.taxa_servico_afiliado));
  const taxas = Math.abs(n(r.taxas)) - taxaServAfiliado;
  const cupom = Math.abs(n(r.cupom_proprio));
  const afiliado = Math.abs(n(r.afiliado));
  const liquida = n(r.receita_liquida);
  const liquidaEstimada = n(r.receita_liquida_estimada);
  const liquidaTotal = liquida + liquidaEstimada;
  const qtdLiquidados = n(r.qtd_liquidados);
  const qtdEstimados = n(r.qtd_estimados);
  const ads = n(r.ads);
  const reemb = n(r.reembolsos);
  const imposto = n(r.imposto);
  const freteCusto = n(r.frete_custo);
  const reembTiktok = n(r.reembolsos_tiktok);
  const acelera = n(r.acelera_taxa);
  const estornos = n(r.estornos);
  const compens = n(r.compensacoes);
  const difal = n(r.difal);
  const ajustes = n(r.ajustes);
  const afilAjuste = n(r.afiliado_ajuste);
  const extrasCarteira = acelera + estornos + difal + ajustes + afilAjuste - compens;
  // receita líquida e CMV dos MESMOS pedidos: pedido sem extrato entra com o líquido estimado, nunca com zero
  const resultado = liquidaTotal + reembTiktok - ads - reemb - imposto - extrasCarteira;
  const margem = receita > 0 ? (resultado / receita) * 100 : 0;
  const cmv = n(c.cmv);
  const itensTotal = n(c.itens_total);
  const itensComCusto = n(c.itens_com_custo);
  const cobertura = itensTotal > 0 ? (itensComCusto / itensTotal) * 100 : 0;
  const lucro = resultado - cmv;
  const margemLucro = receita > 0 ? (lucro / receita) * 100 : 0;
  return { receita, taxas, taxaServAfiliado, cupom, afiliado, liquida, liquidaEstimada, liquidaTotal, qtdLiquidados, qtdEstimados, ads, reemb, imposto, freteCusto, reembTiktok, acelera, estornos, compens, difal, ajustes, afilAjuste, extrasCarteira, resultado, margem, cmv, itensTotal, itensComCusto, cobertura, lucro, margemLucro };
}
