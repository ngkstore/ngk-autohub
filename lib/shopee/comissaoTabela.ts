// Tabela de comissão da Shopee para vendedor CNPJ, versionada por data do pedido.
// Espelho em TypeScript da função SQL shopee_taxa_esperada_item(preco, dia)
// (supabase/legado/auditoria_taxa_out_2026.sql). Mudou a tabela? Mude nos dois.
//
//   até 28/02/2026 ........ 20% + R$4 por item, teto R$104 por item (tabela antiga)
//   01/03 a 30/09/2026 .... faixas por preço, sem teto:
//                            < R$80: 20% + R$4 | 80–99,99: 14% + R$16 | 100–199,99: 14% + R$20 | 200+: 14% + R$26
//   desde 01/10/2026 ...... idem, com a fixa da 1ª faixa em R$4,50
export type FaixaComissao = { pct: number; fixa: number; teto?: number };

export function faixaComissao(preco: number, dataPedido: Date): FaixaComissao {
  const t = dataPedido.getTime();
  const corte1 = Date.UTC(2026, 2, 1, 3); // 01/03/2026 00:00 Brasília
  const corte2 = Date.UTC(2026, 9, 1, 3); // 01/10/2026 00:00 Brasília
  if (t < corte1) return { pct: 0.2, fixa: 4, teto: 104 };
  if (preco < 80) return { pct: 0.2, fixa: t >= corte2 ? 4.5 : 4 };
  if (preco < 100) return { pct: 0.14, fixa: 16 };
  if (preco < 200) return { pct: 0.14, fixa: 20 };
  return { pct: 0.14, fixa: 26 };
}

// Comissão esperada de UM item (comissão + taxa de serviço, sem afiliado), em reais, 2 casas.
export function comissaoEsperadaItem(preco: number, dataPedido: Date): number {
  const f = faixaComissao(preco, dataPedido);
  const bruto = preco * f.pct + f.fixa;
  const v = f.teto != null ? Math.min(bruto, f.teto) : bruto;
  return Math.round(v * 100) / 100;
}
