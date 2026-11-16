// Creators (TikTok) — cálculo PURO: produto parado, nota do criador (0–100) e sugestão por pedido de amostra.
export type CreatorsConfig = {
  parado_estoque_min: number;
  parado_pct: number;
  peso_nivel_gmv: number;
  peso_cumprimento: number;
  peso_categoria: number;
  peso_ja_vendeu: number;
  peso_views: number;
  bonus_parado: number;
  aprovar_nota: number;
  aprovar_nota_custo: number;
  aprovar_custo_max: number;
  recusar_nota: number;
  recusar_custo_min: number;
  frete_amostra: number;
};

export const CONFIG_PADRAO: CreatorsConfig = {
  parado_estoque_min: 300,
  parado_pct: 2,
  peso_nivel_gmv: 35,
  peso_cumprimento: 20,
  peso_categoria: 15,
  peso_ja_vendeu: 15,
  peso_views: 15,
  bonus_parado: 10,
  aprovar_nota: 70,
  aprovar_nota_custo: 50,
  aprovar_custo_max: 40,
  recusar_nota: 30,
  recusar_custo_min: 40,
  frete_amostra: 12,
};

export type CriadorParaNota = {
  nivel: number | null; // 1–6 (creator_level do marketplace)
  gmv: number | null; // GMV do criador (moeda da amostra, BRL)
  taxa_cumprimento: number | null; // 0–100 (% de amostras com conteúdo publicado)
  categorias: string[]; // category_ids onde o criador vende
  ja_vendeu_para_loja: boolean;
  media_views_video: number | null;
};

/** Produto parado = estoque >= mínimo E vendas em 28 d < pct % do estoque. */
export function produtoParado(estoque: number, vendas28: number, cfg: CreatorsConfig = CONFIG_PADRAO): boolean {
  if (estoque < cfg.parado_estoque_min) return false;
  return vendas28 < (estoque * cfg.parado_pct) / 100;
}

const clamp = (v: number, min = 0, max = 1) => Math.max(min, Math.min(max, v));

/** Nota de 0 a 100 com os pesos configurados; devolve também os motivos (componente → pontos). */
export function notaCriador(c: CriadorParaNota, produtoCategoria: string | null, produtoParadoFlag: boolean, cfg: CreatorsConfig = CONFIG_PADRAO): { nota: number; motivos: Record<string, number>; detalhe: string[] } {
  const motivos: Record<string, number> = {};
  const detalhe: string[] = [];
  // Nível (1–6) e GMV: metade de cada; GMV satura em R$ 50 mil
  const nivelFrac = c.nivel ? clamp((c.nivel - 1) / 5) : 0;
  const gmvFrac = c.gmv ? clamp(Math.log10(1 + c.gmv) / Math.log10(1 + 50000)) : 0;
  motivos.nivel_gmv = Math.round(cfg.peso_nivel_gmv * (0.5 * nivelFrac + 0.5 * gmvFrac));
  detalhe.push(`nível ${c.nivel ?? "?"}, GMV ${c.gmv != null ? Math.round(c.gmv) : "?"}: ${motivos.nivel_gmv}/${cfg.peso_nivel_gmv}`);
  // Cumprimento de amostras (0–100 %); sem histórico vale metade
  const cumpr = c.taxa_cumprimento == null ? 0.5 : clamp(c.taxa_cumprimento / 100);
  motivos.cumprimento = Math.round(cfg.peso_cumprimento * cumpr);
  detalhe.push(`cumprimento ${c.taxa_cumprimento == null ? "sem histórico" : c.taxa_cumprimento + "%"}: ${motivos.cumprimento}/${cfg.peso_cumprimento}`);
  // Categoria compatível
  const catOk = !!produtoCategoria && c.categorias.includes(produtoCategoria);
  motivos.categoria = catOk ? cfg.peso_categoria : 0;
  detalhe.push(`categoria ${catOk ? "compatível" : produtoCategoria ? "diferente" : "desconhecida"}: ${motivos.categoria}/${cfg.peso_categoria}`);
  // Já vendeu para a loja
  motivos.ja_vendeu = c.ja_vendeu_para_loja ? cfg.peso_ja_vendeu : 0;
  detalhe.push(`${c.ja_vendeu_para_loja ? "já vendeu" : "nunca vendeu"} para a loja: ${motivos.ja_vendeu}/${cfg.peso_ja_vendeu}`);
  // Média de visualizações por vídeo: satura em 50 mil
  const viewsFrac = c.media_views_video ? clamp(Math.log10(1 + c.media_views_video) / Math.log10(1 + 50000)) : 0;
  motivos.views = Math.round(cfg.peso_views * viewsFrac);
  detalhe.push(`views/vídeo ${c.media_views_video != null ? Math.round(c.media_views_video) : "?"}: ${motivos.views}/${cfg.peso_views}`);
  // Bônus: produto parado
  motivos.bonus_parado = produtoParadoFlag ? cfg.bonus_parado : 0;
  if (produtoParadoFlag) detalhe.push(`produto parado: +${cfg.bonus_parado}`);
  const soma = Object.values(motivos).reduce((s, v) => s + v, 0);
  return { nota: Math.max(0, Math.min(100, soma)), motivos, detalhe };
}

export type Sugestao = "aprovar" | "recusar" | "decidir";

/** Aprovar: nota >= 70, ou nota >= 50 com custo <= 40. Recusar: nota < 30 com custo > 40. Decidir: o resto. */
export function sugestaoAmostra(nota: number, custo: number | null, cfg: CreatorsConfig = CONFIG_PADRAO): Sugestao {
  if (nota >= cfg.aprovar_nota) return "aprovar";
  if (nota >= cfg.aprovar_nota_custo && custo != null && custo <= cfg.aprovar_custo_max) return "aprovar";
  if (nota < cfg.recusar_nota && custo != null && custo > cfg.recusar_custo_min) return "recusar";
  return "decidir";
}

/** Custo da amostra = custo do SKU no UpSeller + frete estimado (null sem custo cadastrado). */
export const custoAmostra = (custoSku: number | null, cfg: CreatorsConfig = CONFIG_PADRAO): number | null => (custoSku == null ? null : Math.round((custoSku + cfg.frete_amostra) * 100) / 100);
