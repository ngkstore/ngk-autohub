// Creators (TikTok) — cálculo PURO: produto parado, nota do criador (0–100) e sugestão por pedido de amostra.
export type FaixaNivelGmv = { nivel: number; gmv: number; pontos: number }; // nível >= OU gmv (BRL) >= → pontos

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
  aprovar_parado_nota: number; // produto parado: nota >= 60 e custo <= 600 aprova
  aprovar_parado_custo_max: number;
  recusar_nota: number;
  recusar_custo_min: number;
  frete_amostra: number; // (legado) usado só se as faixas por peso não existirem
  frete_ate_1kg: number;
  frete_1_a_5kg: number;
  frete_5_a_15kg: number;
  frete_acima_15kg: number;
  frete_sem_peso: number;
  cat_igual: number;
  cat_vizinha: number;
  cat_outra: number;
  cat_desconhecida: number;
  usd_brl: number; // GMV do perfil vem em USD
  escala_nivel_gmv: FaixaNivelGmv[]; // da maior para a menor faixa
};

export const ESCALA_PADRAO: FaixaNivelGmv[] = [
  { nivel: 7, gmv: 500000, pontos: 35 },
  { nivel: 6, gmv: 200000, pontos: 31 },
  { nivel: 5, gmv: 100000, pontos: 27 },
  { nivel: 4, gmv: 40000, pontos: 22 },
  { nivel: 3, gmv: 15000, pontos: 16 },
  { nivel: 2, gmv: 5000, pontos: 10 },
  { nivel: 99, gmv: 1000, pontos: 5 }, // só por GMV
];

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
  aprovar_parado_nota: 60,
  aprovar_parado_custo_max: 600,
  recusar_nota: 30,
  recusar_custo_min: 40,
  frete_amostra: 12,
  frete_ate_1kg: 12,
  frete_1_a_5kg: 25,
  frete_5_a_15kg: 45,
  frete_acima_15kg: 80,
  frete_sem_peso: 25,
  cat_igual: 15,
  cat_vizinha: 8,
  cat_outra: 3,
  cat_desconhecida: 5,
  usd_brl: 5.4,
  escala_nivel_gmv: ESCALA_PADRAO,
};

/** Frete estimado da amostra por faixa de peso do SKU (R-002). */
export function freteEstimado(pesoKg: number | null, cfg: CreatorsConfig = CONFIG_PADRAO): { frete: number; semPeso: boolean } {
  if (pesoKg == null || !(pesoKg > 0)) return { frete: cfg.frete_sem_peso, semPeso: true };
  if (pesoKg <= 1) return { frete: cfg.frete_ate_1kg, semPeso: false };
  if (pesoKg <= 5) return { frete: cfg.frete_1_a_5kg, semPeso: false };
  if (pesoKg <= 15) return { frete: cfg.frete_5_a_15kg, semPeso: false };
  return { frete: cfg.frete_acima_15kg, semPeso: false };
}

/** Produto parado = estoque >= mínimo E vendas em 28 d < pct % do estoque. */
export function produtoParado(estoque: number, vendas28: number, cfg: CreatorsConfig = CONFIG_PADRAO): boolean {
  if (estoque < cfg.parado_estoque_min) return false;
  return vendas28 < (estoque * cfg.parado_pct) / 100;
}

/** Bloco "nível e GMV" (T-003): o MAIOR entre nível e GMV (BRL) define a faixa; pontos escalados pelo peso configurado. */
export function pontosNivelGmv(nivel: number | null, gmvBrl: number | null, cfg: CreatorsConfig = CONFIG_PADRAO): number {
  const escala = (cfg.escala_nivel_gmv?.length ? cfg.escala_nivel_gmv : ESCALA_PADRAO).slice().sort((a, b) => b.pontos - a.pontos);
  const n = nivel ?? 0;
  const g = gmvBrl ?? 0;
  for (const f of escala) if ((f.nivel < 99 && n >= f.nivel) || g >= f.gmv) return Math.round((f.pontos * cfg.peso_nivel_gmv) / 35);
  return 0;
}

// Grupos de categorias vizinhas (nomes de primeiro nível do TikTok, sem acento e em minúsculas)
// 1º nível do TikTok BR (conferido 17/11/2026): "Artigos para casa", "Utensílios de cozinha", "Móveis",
// "Eletrodomésticos", "Têxteis e artigos de decoração", "Melhorias para o lar" | "Brinquedos e hobbies",
// "Bebê e maternidade", "Kids' Fashion"
const GRUPOS_VIZINHOS: string[][] = [
  ["artigos para casa", "casa", "cozinha", "moveis", "eletrodomesticos", "texteis", "melhorias para o lar", "utilidades domesticas", "home", "kitchenware", "furniture", "household appliances", "textiles"],
  ["brinquedos", "bebe", "maternidade", "kids", "moda infantil", "toys", "baby"],
];
export const normCat = (s: string | null | undefined) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const grupoDe = (nome: string | null | undefined): number => {
  const n = normCat(nome);
  if (!n) return -1;
  return GRUPOS_VIZINHOS.findIndex((g) => g.some((p) => n.includes(p)));
};

export type CategoriaProduto = { ids: string[]; nivel1Id: string | null; nivel1Nome: string | null };
export type CategoriaCriador = { id: string; nivel1Id: string | null; nivel1Nome: string | null };

/** Categoria: igual (mesma categoria de 1º nível ou id em comum), vizinha (grupo), outra, desconhecida (sem dado — não zera). */
export function pontosCategoria(produto: CategoriaProduto | null, criador: CategoriaCriador[], cfg: CreatorsConfig = CONFIG_PADRAO): { pontos: number; motivo: "igual" | "vizinha" | "outra" | "desconhecida" } {
  if (!produto || (!produto.nivel1Id && !produto.ids.length) || !criador.length) return { pontos: cfg.cat_desconhecida, motivo: "desconhecida" };
  const idsProduto = new Set(produto.ids);
  if (criador.some((c) => idsProduto.has(c.id) || (c.nivel1Id && c.nivel1Id === produto.nivel1Id))) return { pontos: cfg.cat_igual, motivo: "igual" };
  const gp = grupoDe(produto.nivel1Nome);
  const conhecidas = criador.filter((c) => c.nivel1Id || c.nivel1Nome);
  if (!conhecidas.length) return { pontos: cfg.cat_desconhecida, motivo: "desconhecida" };
  if (gp >= 0 && conhecidas.some((c) => grupoDe(c.nivel1Nome) === gp)) return { pontos: cfg.cat_vizinha, motivo: "vizinha" };
  return { pontos: cfg.cat_outra, motivo: "outra" };
}

const clamp = (v: number, min = 0, max = 1) => Math.max(min, Math.min(max, v));

export type CriadorParaNota = {
  nivel: number | null; // 1–7 (creator_level do marketplace)
  gmv: number | null; // GMV do criador em BRL
  taxa_cumprimento: number | null; // 0–100
  categorias: CategoriaCriador[];
  ja_vendeu_para_loja: boolean;
  media_views_video: number | null;
};

/** Nota de 0 a 100 com os pesos configurados; devolve também os motivos (componente → pontos). */
export function notaCriador(c: CriadorParaNota, produtoCategoria: CategoriaProduto | null, produtoParadoFlag: boolean, cfg: CreatorsConfig = CONFIG_PADRAO): { nota: number; motivos: Record<string, number>; detalhe: string[] } {
  const motivos: Record<string, number> = {};
  const detalhe: string[] = [];
  motivos.nivel_gmv = pontosNivelGmv(c.nivel, c.gmv, cfg);
  detalhe.push(`nível ${c.nivel ?? "?"}, GMV ${c.gmv != null ? "R$ " + Math.round(c.gmv).toLocaleString("pt-BR") : "?"}: ${motivos.nivel_gmv}/${cfg.peso_nivel_gmv}`);
  const cumpr = c.taxa_cumprimento == null ? 0.5 : clamp(c.taxa_cumprimento / 100);
  motivos.cumprimento = Math.round(cfg.peso_cumprimento * cumpr);
  detalhe.push(`cumprimento ${c.taxa_cumprimento == null ? "sem histórico" : c.taxa_cumprimento + "%"}: ${motivos.cumprimento}/${cfg.peso_cumprimento}`);
  const cat = pontosCategoria(produtoCategoria, c.categorias, cfg);
  motivos.categoria = Math.round((cat.pontos * cfg.peso_categoria) / 15);
  detalhe.push(`categoria ${cat.motivo}${produtoCategoria?.nivel1Nome ? ` (${produtoCategoria.nivel1Nome})` : ""}: ${motivos.categoria}/${cfg.peso_categoria}`);
  motivos.ja_vendeu = c.ja_vendeu_para_loja ? cfg.peso_ja_vendeu : 0;
  detalhe.push(`${c.ja_vendeu_para_loja ? "já vendeu" : "nunca vendeu"} para a loja: ${motivos.ja_vendeu}/${cfg.peso_ja_vendeu}`);
  const viewsFrac = c.media_views_video ? clamp(Math.log10(1 + c.media_views_video) / Math.log10(1 + 50000)) : 0;
  motivos.views = Math.round(cfg.peso_views * viewsFrac);
  detalhe.push(`views/vídeo ${c.media_views_video != null ? Math.round(c.media_views_video) : "?"}: ${motivos.views}/${cfg.peso_views}`);
  motivos.bonus_parado = produtoParadoFlag ? cfg.bonus_parado : 0;
  if (produtoParadoFlag) detalhe.push(`produto parado: +${cfg.bonus_parado}`);
  const soma = Object.values(motivos).reduce((s, v) => s + v, 0);
  return { nota: Math.max(0, Math.min(100, soma)), motivos, detalhe };
}

export type Sugestao = "aprovar" | "recusar" | "decidir";

/** Aprovar: nota >= 70; ou >= 50 com custo <= 40; ou produto parado com nota >= 60 e custo <= 600. Recusar: nota < 30 com custo > 40. */
export function sugestaoAmostra(nota: number, custo: number | null, cfg: CreatorsConfig = CONFIG_PADRAO, produtoParadoFlag = false): Sugestao {
  if (nota >= cfg.aprovar_nota) return "aprovar";
  if (nota >= cfg.aprovar_nota_custo && custo != null && custo <= cfg.aprovar_custo_max) return "aprovar";
  if (produtoParadoFlag && nota >= cfg.aprovar_parado_nota && custo != null && custo <= cfg.aprovar_parado_custo_max) return "aprovar";
  if (nota < cfg.recusar_nota && custo != null && custo > cfg.recusar_custo_min) return "recusar";
  return "decidir";
}

/** Custo da amostra = custo do SKU no UpSeller + frete estimado pela faixa de peso (null sem custo cadastrado). */
export const custoAmostra = (custoSku: number | null, cfg: CreatorsConfig = CONFIG_PADRAO, pesoKg: number | null = null): number | null => (custoSku == null ? null : Math.round((custoSku + freteEstimado(pesoKg, cfg).frete) * 100) / 100);
