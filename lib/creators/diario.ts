import { supabase } from "@/lib/supabase";
import { criarAlerta } from "@/lib/alertas";
import { enviarTelegram } from "@/lib/telegram";
import { chamarComBackoff } from "@/lib/tiktok/creators";
import type { LojaTikTok } from "@/lib/tiktok/lojas";
import { custoAmostra, notaCriador, produtoParado, sugestaoAmostra, type CreatorsConfig } from "@/lib/creators/calculo";
import { creatorsConfig } from "@/lib/creators/config";
import { normSku } from "@/lib/estoque/consultas";

// Creators — cálculo diário: produtos parados, nota e sugestão de cada pedido de amostra aberto, alerta.
type J = Record<string, unknown>;
const n = (v: unknown) => Number(v || 0);
const BASE_URL = process.env.APP_URL || "https://ngk-autohub.vercel.app";

async function contaDaLoja(lojaId: string): Promise<string | null> {
  const { data } = await supabase.from("lojas").select("conta_id").eq("id", lojaId).maybeSingle();
  return (data?.conta_id as string | null) ?? null;
}

// Estoque UpSeller por produto do TikTok: mapeamento item/variação → SKU do armazém; senão SKU do anúncio normalizado.
async function estoquePorProduto(lojaId: string): Promise<Map<string, { estoque: number; sku: string | null; custo: number | null }>> {
  const [{ data: varia }, { data: mapa }, { data: arm }, { data: cat }] = await Promise.all([
    supabase.from("produto_variacoes").select("item_id, model_id, model_sku").eq("loja_id", lojaId).limit(20000),
    supabase.from("catalogo_mapeamento").select("item_id, model_id, sku_armazem").eq("loja_id", lojaId).limit(20000),
    supabase.from("estoque_armazem").select("sku, disponivel").limit(20000),
    supabase.from("catalogo_sku").select("sku, custo").limit(20000),
  ]);
  const disp = new Map<string, { estoque: number; sku: string }>();
  for (const e of arm || []) {
    const k = normSku(e.sku);
    const atual = disp.get(k) || { estoque: 0, sku: e.sku };
    atual.estoque += n(e.disponivel);
    disp.set(k, atual);
  }
  const custo = new Map<string, number | null>();
  for (const c of cat || []) custo.set(normSku(c.sku), c.custo == null ? null : Number(c.custo));
  const porItem = new Map<string, string>();
  for (const m of mapa || []) if (m.item_id) porItem.set(`${m.item_id}|${m.model_id || ""}`, m.sku_armazem);
  const saida = new Map<string, { estoque: number; sku: string | null; custo: number | null }>();
  for (const v of varia || []) {
    const skuTxt = porItem.get(`${v.item_id}|${v.model_id === "0" ? "" : v.model_id || ""}`) || porItem.get(`${v.item_id}|`) || v.model_sku;
    if (!skuTxt) continue;
    const d = disp.get(normSku(skuTxt));
    const atual = saida.get(v.item_id) || { estoque: 0, sku: null, custo: null };
    if (d) {
      atual.estoque += d.estoque;
      atual.sku = atual.sku ?? d.sku;
    }
    if (atual.custo == null) atual.custo = custo.get(normSku(skuTxt)) ?? null;
    saida.set(v.item_id, atual);
  }
  return saida;
}

// Visualizações e pedidos em 28 d por produto (analytics shop_products/performance).
async function desempenho28d(loja: LojaTikTok): Promise<Map<string, { views: number | null; pedidos: number }>> {
  const saida = new Map<string, { views: number | null; pedidos: number }>();
  const ymd = (d: Date) => d.toISOString().slice(0, 10);
  const fim = new Date();
  const ini = new Date(fim.getTime() - 28 * 86400000);
  let token = "";
  for (let i = 0; i < 20; i++) {
    const r = await chamarComBackoff(loja, "/analytics/202605/shop_products/performance", { query: { page_size: "100", start_date_ge: ymd(ini), end_date_lt: ymd(new Date(fim.getTime() + 86400000)), ...(token ? { page_token: token } : {}) } }, "creators_analytics");
    if (Number(r.code) !== 0) break;
    for (const p of (((r.data as J) || {}).products as J[]) || []) {
      const seller = (p.seller_performance as J) || (p.shop_performance as J) || {};
      const views = p.page_views ?? p.product_page_views ?? p.impressions ?? seller.page_views ?? seller.impressions ?? null;
      const pedidos = n(p.sku_orders ?? p.orders ?? seller.sku_orders ?? seller.orders) + n(((p.affiliate_total_performance as J) || {}).sku_orders);
      saida.set(String(p.id ?? p.product_id), { views: views == null ? null : Number(views), pedidos });
    }
    token = String(((r.data as J) || {}).next_page_token || "");
    if (!token) break;
  }
  return saida;
}

export async function calcularProdutosParados(loja: LojaTikTok, cfg: CreatorsConfig): Promise<{ produtos: number; parados: number }> {
  const [estoque, desempenho, { data: prods }, { data: vendas }, { data: amostras }] = await Promise.all([
    estoquePorProduto(loja.lojaId),
    desempenho28d(loja).catch(() => new Map<string, { views: number | null; pedidos: number }>()),
    supabase.from("tiktok_produtos").select("produto_id, nome, categoria_id").eq("loja_id", loja.lojaId).limit(5000),
    supabase.from("pedido_itens").select("item_id, qtd").eq("loja_id", loja.lojaId).gte("dia", new Date(Date.now() - 28 * 86400000).toISOString().slice(0, 10)).limit(50000),
    supabase.from("tiktok_amostras").select("produto_id").eq("loja_id", loja.lojaId).eq("status", "PENDING"),
  ]);
  const vendas28 = new Map<string, number>();
  for (const v of vendas || []) if (v.item_id) vendas28.set(v.item_id, (vendas28.get(v.item_id) || 0) + n(v.qtd));
  const pend = new Map<string, number>();
  for (const a of amostras || []) if (a.produto_id) pend.set(a.produto_id, (pend.get(a.produto_id) || 0) + 1);
  const nomes = new Map((prods || []).map((p) => [p.produto_id, p]));
  const ids = new Set<string>([...estoque.keys(), ...nomes.keys()]);
  const linhas: J[] = [];
  let parados = 0;
  for (const id of ids) {
    const e = estoque.get(id);
    const v = vendas28.get(id) || 0;
    const d = desempenho.get(id);
    const parado = produtoParado(e?.estoque ?? 0, v, cfg);
    if (parado) parados++;
    linhas.push({ loja_id: loja.lojaId, produto_id: id, nome: nomes.get(id)?.nome ?? null, categoria_id: nomes.get(id)?.categoria_id ?? null, sku_armazem: e?.sku ?? null, estoque: e?.estoque ?? 0, vendas_28d: v, pedidos_28d: d?.pedidos ?? null, views_28d: d?.views ?? null, parado, amostras_pendentes: pend.get(id) || 0, calculado_em: new Date().toISOString() });
  }
  for (let i = 0; i < linhas.length; i += 500) await supabase.from("tiktok_produtos_parados").upsert(linhas.slice(i, i + 500), { onConflict: "loja_id,produto_id" });
  return { produtos: linhas.length, parados };
}

export async function calcularNotasESugestoes(loja: LojaTikTok, cfg: CreatorsConfig): Promise<{ avaliadas: number; aprovar: number; recusar: number; decidir: number }> {
  const [{ data: amostras }, { data: criadores }, { data: parados }, { data: vendedores }, estoque] = await Promise.all([
    supabase.from("tiktok_amostras").select("amostra_id, criador_id, produto_id, sku_id").eq("loja_id", loja.lojaId).eq("status", "PENDING").limit(5000),
    supabase.from("tiktok_criadores").select("criador_id, nivel, gmv, gmv_moeda, taxa_cumprimento, categorias, media_views_video").limit(20000),
    supabase.from("tiktok_produtos_parados").select("produto_id, parado, categoria_id").eq("loja_id", loja.lojaId).limit(5000),
    supabase.from("tiktok_afiliado_pedidos").select("criador_id").eq("loja_id", loja.lojaId).limit(50000),
    estoquePorProduto(loja.lojaId),
  ]);
  const cri = new Map((criadores || []).map((c) => [c.criador_id, c]));
  const par = new Map((parados || []).map((p) => [p.produto_id, p]));
  const jaVendeu = new Set((vendedores || []).map((v) => v.criador_id).filter(Boolean));
  const cont = { avaliadas: 0, aprovar: 0, recusar: 0, decidir: 0 };
  for (const a of amostras || []) {
    const c = a.criador_id ? cri.get(a.criador_id) : null;
    const p = a.produto_id ? par.get(a.produto_id) : null;
    const e = a.produto_id ? estoque.get(a.produto_id) : null;
    const r = notaCriador(
      { nivel: c?.nivel ?? null, gmv: c?.gmv != null ? Number(c.gmv) : null, taxa_cumprimento: c?.taxa_cumprimento != null ? Number(c.taxa_cumprimento) : null, categorias: Array.isArray(c?.categorias) ? (c!.categorias as string[]) : [], ja_vendeu_para_loja: !!a.criador_id && jaVendeu.has(a.criador_id), media_views_video: c?.media_views_video != null ? Number(c.media_views_video) : null },
      p?.categoria_id ?? null,
      !!p?.parado,
      cfg
    );
    const custo = custoAmostra(e?.custo ?? null, cfg);
    const sug = sugestaoAmostra(r.nota, custo, cfg);
    cont.avaliadas++;
    cont[sug]++;
    await supabase.from("tiktok_amostras").update({ nota: r.nota, nota_motivos: { pontos: r.motivos, detalhe: r.detalhe }, custo_amostra: custo, sugestao: sug, atualizado_em: new Date().toISOString() }).eq("loja_id", loja.lojaId).eq("amostra_id", a.amostra_id);
  }
  return cont;
}

// Alerta: pedido com sugestão "Aprovar" vencendo em menos de 12 h (um aviso por pedido).
export async function alertarAmostrasVencendo(lojaId: string): Promise<number> {
  const limite = new Date(Date.now() + 12 * 3600000).toISOString();
  const { data } = await supabase.from("tiktok_amostras").select("amostra_id, criador_usuario, produto_nome, nota, expira_em").eq("loja_id", lojaId).eq("status", "PENDING").eq("sugestao", "aprovar").lte("expira_em", limite).gt("expira_em", new Date().toISOString()).order("expira_em").limit(20);
  let enviados = 0;
  for (const a of data || []) {
    const chave = `creators:vence:${a.amostra_id}`;
    const { data: ja } = await supabase.from("alertas").select("id").eq("tipo", "creators").ilike("descricao", `%${a.amostra_id}%`).limit(1).maybeSingle();
    if (ja) continue;
    const texto = `🎬 Amostra sugerida para APROVAR vence em menos de 12 h: ${a.criador_usuario ?? "?"} · ${a.produto_nome ?? ""} · nota ${a.nota} · vence ${new Date(a.expira_em).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`;
    await criarAlerta({ lojaId, tipo: "creators", titulo: "Pedido de amostra vencendo", descricao: `${texto} (${a.amostra_id}) — decidir em ${BASE_URL}/creators` });
    await enviarTelegram(`${texto}\n${BASE_URL}/creators`).catch(() => false);
    void chave;
    enviados++;
  }
  return enviados;
}

export async function rodarDiarioCreators(loja: LojaTikTok) {
  const cfg = await creatorsConfig(await contaDaLoja(loja.lojaId));
  const parados = await calcularProdutosParados(loja, cfg);
  const notas = await calcularNotasESugestoes(loja, cfg);
  const alertas = await alertarAmostrasVencendo(loja.lojaId);
  return { loja_id: loja.lojaId, ...parados, ...notas, alertas };
}
