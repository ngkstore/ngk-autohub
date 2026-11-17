import { supabase } from "@/lib/supabase";
import { criarAlerta } from "@/lib/alertas";
import { enviarTelegram } from "@/lib/telegram";
import { chamarComBackoff } from "@/lib/tiktok/creators";
import type { LojaTikTok } from "@/lib/tiktok/lojas";
import { custoAmostra, freteEstimado, notaCriador, produtoParado, sugestaoAmostra, type CategoriaCriador, type CategoriaProduto, type CreatorsConfig } from "@/lib/creators/calculo";
import { creatorsConfig } from "@/lib/creators/config";
import { normSku } from "@/lib/estoque/consultas";

// Creators — cálculo: produtos parados (diário), nota e sugestão de cada pedido aberto (a cada rodada), alerta.
type J = Record<string, unknown>;
const n = (v: unknown) => Number(v || 0);
const BASE_URL = process.env.APP_URL || "https://ngk-autohub.vercel.app";

// PostgREST devolve no máximo 1000 linhas por chamada: pagina com range.
async function todas<T>(monta: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: unknown }>, max = 50000): Promise<T[]> {
  const saida: T[] = [];
  for (let de = 0; de < max; de += 1000) {
    const { data } = await monta(de, de + 999);
    if (!data?.length) break;
    saida.push(...data);
    if (data.length < 1000) break;
  }
  return saida;
}

async function contaDaLoja(lojaId: string): Promise<string | null> {
  const { data } = await supabase.from("lojas").select("conta_id").eq("id", lojaId).maybeSingle();
  return (data?.conta_id as string | null) ?? null;
}

// Estoque e custo do UpSeller por produto e por SKU do TikTok:
// variação (item_id, model_id) → mapeamento item/variação → SKU do armazém; senão SKU do anúncio normalizado.
type Fisico = { estoque: number; sku: string | null; custo: number | null; peso: number | null };
async function fisicoTikTok(lojaId: string): Promise<{ porProduto: Map<string, Fisico>; porSku: Map<string, Fisico> }> {
  // item_id/model_id são bigint: sem ::text o JS perde precisão (> 2^53) e as chaves não casam
  const [varia, mapa, arm, cat] = await Promise.all([
    todas<{ item_id: string; model_id: string | null; model_sku: string | null }>((de, ate) => supabase.from("produto_variacoes").select("item_id::text, model_id::text, model_sku").eq("loja_id", lojaId).range(de, ate)),
    todas<{ item_id: string | null; model_id: string | null; sku_armazem: string }>((de, ate) => supabase.from("catalogo_mapeamento").select("item_id, model_id, sku_armazem").eq("loja_id", lojaId).range(de, ate)),
    todas<{ sku: string; disponivel: number | null }>((de, ate) => supabase.from("estoque_armazem").select("sku, disponivel").range(de, ate)),
    todas<{ sku: string; custo: number | null; peso_kg: number | null }>((de, ate) => supabase.from("catalogo_sku").select("sku, custo, peso_kg").range(de, ate)),
  ]);
  const disp = new Map<string, { estoque: number; sku: string }>();
  for (const e of arm || []) {
    const k = normSku(e.sku);
    const atual = disp.get(k) || { estoque: 0, sku: e.sku };
    atual.estoque += n(e.disponivel);
    disp.set(k, atual);
  }
  const catalogo = new Map<string, { custo: number | null; peso: number | null }>();
  for (const c of cat || []) catalogo.set(normSku(c.sku), { custo: c.custo == null ? null : Number(c.custo), peso: c.peso_kg == null ? null : Number(c.peso_kg) });
  const porItem = new Map<string, string>();
  for (const m of mapa || []) if (m.item_id) porItem.set(`${m.item_id}|${m.model_id || ""}`, m.sku_armazem);
  const porProduto = new Map<string, Fisico>();
  const porSku = new Map<string, Fisico>();
  for (const v of varia || []) {
    const modelId = String(v.model_id ?? "") === "0" ? "" : String(v.model_id ?? "");
    const skuTxt = porItem.get(`${v.item_id}|${modelId}`) || porItem.get(`${v.item_id}|`) || v.model_sku;
    if (!skuTxt) continue;
    const d = disp.get(normSku(skuTxt));
    const c = catalogo.get(normSku(skuTxt));
    const f: Fisico = { estoque: d?.estoque ?? 0, sku: d?.sku ?? skuTxt, custo: c?.custo ?? null, peso: c?.peso ?? null };
    porSku.set(`${v.item_id}|${String(v.model_id ?? "")}`, f);
    const atual = porProduto.get(v.item_id) || { estoque: 0, sku: null, custo: null, peso: null };
    atual.estoque += f.estoque;
    atual.sku = atual.sku ?? f.sku;
    if (atual.custo == null) atual.custo = f.custo;
    if (atual.peso == null) atual.peso = f.peso;
    porProduto.set(v.item_id, atual);
  }
  return { porProduto, porSku };
}

// Pedidos e impressões em 28 d por produto (analytics shop_products/performance → total_performance.orders / product_impressions).
async function desempenho28d(loja: LojaTikTok): Promise<Map<string, { views: number | null; pedidos: number | null }>> {
  const saida = new Map<string, { views: number | null; pedidos: number | null }>();
  const ymd = (d: Date) => d.toISOString().slice(0, 10);
  const fim = new Date();
  const ini = new Date(fim.getTime() - 28 * 86400000);
  let token = "";
  for (let i = 0; i < 20; i++) {
    const r = await chamarComBackoff(loja, "/analytics/202605/shop_products/performance", { query: { page_size: "100", start_date_ge: ymd(ini), end_date_lt: ymd(new Date(fim.getTime() + 86400000)), ...(token ? { page_token: token } : {}) } }, "creators_analytics");
    if (Number(r.code) !== 0) break;
    for (const p of (((r.data as J) || {}).products as J[]) || []) {
      const tot = (p.total_performance as J) || {};
      const views = tot.product_impressions ?? tot.unique_product_impressions ?? null;
      const pedidos = tot.orders ?? tot.sku_orders ?? null;
      saida.set(String(p.id ?? p.product_id), { views: views == null ? null : Number(views), pedidos: pedidos == null ? null : Number(pedidos) });
    }
    token = String(((r.data as J) || {}).next_page_token || "");
    if (!token) break;
  }
  return saida;
}

export async function calcularProdutosParados(loja: LojaTikTok, cfg: CreatorsConfig): Promise<{ produtos: number; parados: number }> {
  const dia28 = new Date(Date.now() - 28 * 86400000).toISOString().slice(0, 10);
  const [{ porProduto }, desempenho, prods, vendas, amostras] = await Promise.all([
    fisicoTikTok(loja.lojaId),
    desempenho28d(loja).catch(() => new Map<string, { views: number | null; pedidos: number | null }>()),
    todas<{ produto_id: string; nome: string | null; categoria_id: string | null }>((de, ate) => supabase.from("tiktok_produtos").select("produto_id, nome, categoria_id").eq("loja_id", loja.lojaId).range(de, ate)),
    // "vendas 28 d" = unidades vendidas nos pedidos do TikTok que o AutoHub tem (pedido_itens, pelo product_id)
    todas<{ item_id: string | null; qtd: number | null }>((de, ate) => supabase.from("pedido_itens").select("item_id, qtd").eq("loja_id", loja.lojaId).gte("dia", dia28).range(de, ate)),
    todas<{ produto_id: string | null }>((de, ate) => supabase.from("tiktok_amostras").select("produto_id").eq("loja_id", loja.lojaId).eq("status", "PENDING").range(de, ate)),
  ]);
  const vendas28 = new Map<string, number>();
  for (const v of vendas || []) if (v.item_id) vendas28.set(v.item_id, (vendas28.get(v.item_id) || 0) + n(v.qtd));
  const pend = new Map<string, number>();
  for (const a of amostras || []) if (a.produto_id) pend.set(a.produto_id, (pend.get(a.produto_id) || 0) + 1);
  const nomes = new Map((prods || []).map((p) => [p.produto_id, p]));
  const ids = new Set<string>([...porProduto.keys(), ...nomes.keys()]);
  const linhas: J[] = [];
  let parados = 0;
  for (const id of ids) {
    const e = porProduto.get(id);
    const v = vendas28.get(id) || 0;
    const d = desempenho.get(id);
    const parado = produtoParado(e?.estoque ?? 0, v, cfg);
    if (parado) parados++;
    linhas.push({ loja_id: loja.lojaId, produto_id: id, nome: nomes.get(id)?.nome ?? null, categoria_id: nomes.get(id)?.categoria_id ?? null, sku_armazem: e?.sku ?? null, estoque: e?.estoque ?? 0, vendas_28d: v, pedidos_28d: d?.pedidos ?? null, views_28d: d?.views ?? null, parado, amostras_pendentes: pend.get(id) || 0, calculado_em: new Date().toISOString() });
  }
  for (let i = 0; i < linhas.length; i += 500) await supabase.from("tiktok_produtos_parados").upsert(linhas.slice(i, i + 500), { onConflict: "loja_id,produto_id" });
  return { produtos: linhas.length, parados };
}

// Nota e sugestão de todo pedido aberto — roda no coletor (30 min, os pedidos vencem em horas) e no diário.
export async function calcularNotasESugestoes(loja: LojaTikTok, cfg: CreatorsConfig): Promise<{ avaliadas: number; aprovar: number; recusar: number; decidir: number }> {
  type Cri = { criador_id: string; nivel: number | null; gmv: number | null; gmv_moeda: string | null; gmv_brl: number | null; gmv_usd: number | null; taxa_cumprimento: number | null; categorias: unknown; media_views_video: number | null };
  type Prod = { produto_id: string; categoria_id: string | null; categoria_nivel1_id: string | null; categoria_nivel1_nome: string | null; categoria_cadeia: unknown; peso_kg: number | null };
  const [amostras, criadores, parados, vendedores, fisico, prods, cats] = await Promise.all([
    todas<{ amostra_id: string; criador_id: string | null; produto_id: string | null; sku_id: string | null }>((de, ate) => supabase.from("tiktok_amostras").select("amostra_id, criador_id, produto_id, sku_id").eq("loja_id", loja.lojaId).eq("status", "PENDING").range(de, ate)),
    todas<Cri>((de, ate) => supabase.from("tiktok_criadores").select("criador_id, nivel, gmv, gmv_moeda, gmv_brl, gmv_usd, taxa_cumprimento, categorias, media_views_video").range(de, ate)),
    todas<{ produto_id: string; parado: boolean }>((de, ate) => supabase.from("tiktok_produtos_parados").select("produto_id, parado").eq("loja_id", loja.lojaId).range(de, ate)),
    todas<{ criador_id: string | null }>((de, ate) => supabase.from("tiktok_afiliado_pedidos").select("criador_id").eq("loja_id", loja.lojaId).not("criador_id", "is", null).range(de, ate)),
    fisicoTikTok(loja.lojaId),
    todas<Prod>((de, ate) => supabase.from("tiktok_produtos").select("produto_id, categoria_id, categoria_nivel1_id, categoria_nivel1_nome, categoria_cadeia, peso_kg").eq("loja_id", loja.lojaId).range(de, ate)),
    todas<{ id: string; nivel1_id: string | null; nivel1_nome: string | null }>((de, ate) => supabase.from("tiktok_categorias").select("id, nivel1_id, nivel1_nome").range(de, ate)),
  ]);
  const cri = new Map((criadores || []).map((c) => [c.criador_id, c]));
  const par = new Map((parados || []).map((p) => [p.produto_id, p]));
  const prodInfo = new Map((prods || []).map((p) => [p.produto_id, p]));
  const catTree = new Map((cats || []).map((c) => [c.id, c]));
  const jaVendeu = new Set((vendedores || []).map((v) => v.criador_id).filter(Boolean));
  const cont = { avaliadas: 0, aprovar: 0, recusar: 0, decidir: 0 };
  for (const a of amostras || []) {
    const c = a.criador_id ? cri.get(a.criador_id) : null;
    const p = a.produto_id ? par.get(a.produto_id) : null;
    const info = a.produto_id ? prodInfo.get(a.produto_id) : null;
    const porSku = a.produto_id ? fisico.porSku.get(`${a.produto_id}|${a.sku_id || ""}`) ?? fisico.porSku.get(`${a.produto_id}|0`) : null;
    const e = porSku ?? (a.produto_id ? fisico.porProduto.get(a.produto_id) : null);
    // GMV em BRL: o que veio na amostra (BRL); senão o do perfil (USD × usd_brl)
    const gmvBrl = c?.gmv_brl != null ? Number(c.gmv_brl) : c?.gmv != null && (c.gmv_moeda ?? "BRL") === "BRL" ? Number(c.gmv) : c?.gmv_usd != null ? Number(c.gmv_usd) * cfg.usd_brl : null;
    const categoriasCriador: CategoriaCriador[] = (Array.isArray(c?.categorias) ? (c!.categorias as string[]) : []).map((id) => ({ id, nivel1Id: catTree.get(id)?.nivel1_id ?? null, nivel1Nome: catTree.get(id)?.nivel1_nome ?? null }));
    const cadeia = Array.isArray(info?.categoria_cadeia) ? (info!.categoria_cadeia as { id: string }[]) : [];
    const categoriaProduto: CategoriaProduto | null = info && (info.categoria_nivel1_id || cadeia.length) ? { ids: cadeia.map((x) => String(x.id)), nivel1Id: info.categoria_nivel1_id ?? null, nivel1Nome: info.categoria_nivel1_nome ?? null } : null;
    const r = notaCriador(
      { nivel: c?.nivel ?? null, gmv: gmvBrl, taxa_cumprimento: c?.taxa_cumprimento != null ? Number(c.taxa_cumprimento) : null, categorias: categoriasCriador, ja_vendeu_para_loja: !!a.criador_id && jaVendeu.has(a.criador_id), media_views_video: c?.media_views_video != null ? Number(c.media_views_video) : null },
      categoriaProduto,
      !!p?.parado,
      cfg
    );
    // peso: produto do TikTok (package_weight do detalhe) ou SKU do UpSeller; sem peso → frete padrão e aviso
    const peso = info?.peso_kg != null ? Number(info.peso_kg) : e?.peso ?? null;
    const frete = freteEstimado(peso, cfg);
    const custo = custoAmostra(e?.custo ?? null, cfg, peso);
    const detalhe = [...r.detalhe, `custo: SKU ${porSku ? "pedido" : "do produto"} ${e?.custo != null ? "R$ " + e.custo.toFixed(2) : "sem custo"} + frete R$ ${frete.frete.toFixed(2)}${frete.semPeso ? " (frete estimado sem peso)" : ` (${peso} kg)`}`];
    const sug = sugestaoAmostra(r.nota, custo, cfg, !!p?.parado);
    cont.avaliadas++;
    cont[sug]++;
    await supabase.from("tiktok_amostras").update({ nota: r.nota, nota_motivos: { pontos: r.motivos, detalhe }, custo_amostra: custo, peso_kg: peso, sugestao: sug, atualizado_em: new Date().toISOString() }).eq("loja_id", loja.lojaId).eq("amostra_id", a.amostra_id);
  }
  return cont;
}

// Alerta: pedido com sugestão "Aprovar" vencendo em menos de 12 h (um aviso por pedido).
export async function alertarAmostrasVencendo(lojaId: string): Promise<number> {
  const limite = new Date(Date.now() + 12 * 3600000).toISOString();
  const { data } = await supabase.from("tiktok_amostras").select("amostra_id, criador_usuario, produto_nome, nota, expira_em").eq("loja_id", lojaId).eq("status", "PENDING").eq("sugestao", "aprovar").lte("expira_em", limite).gt("expira_em", new Date().toISOString()).order("expira_em").limit(20);
  let enviados = 0;
  for (const a of data || []) {
    const { data: ja } = await supabase.from("alertas").select("id").eq("tipo", "creators").ilike("descricao", `%${a.amostra_id}%`).limit(1).maybeSingle();
    if (ja) continue;
    const texto = `🎬 Amostra sugerida para APROVAR vence em menos de 12 h: ${a.criador_usuario ?? "?"} · ${a.produto_nome ?? ""} · nota ${a.nota} · vence ${new Date(a.expira_em).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`;
    await criarAlerta({ lojaId, tipo: "creators", titulo: "Pedido de amostra vencendo", descricao: `${texto} (${a.amostra_id}) — decidir em ${BASE_URL}/creators` });
    await enviarTelegram(`${texto}\n${BASE_URL}/creators`).catch(() => false);
    enviados++;
  }
  return enviados;
}

// Usado pelo coletor (30 min): nota/sugestão de todo pedido aberto + alerta de "Aprovar" vencendo em < 12 h.
export async function avaliarEAlertar(loja: LojaTikTok) {
  const cfg = await creatorsConfig(await contaDaLoja(loja.lojaId));
  const notas = await calcularNotasESugestoes(loja, cfg);
  const alertas = await alertarAmostrasVencendo(loja.lojaId);
  return { ...notas, alertas };
}

export async function rodarDiarioCreators(loja: LojaTikTok) {
  const cfg = await creatorsConfig(await contaDaLoja(loja.lojaId));
  const parados = await calcularProdutosParados(loja, cfg);
  const notas = await calcularNotasESugestoes(loja, cfg);
  const alertas = await alertarAmostrasVencendo(loja.lojaId);
  return { loja_id: loja.lojaId, ...parados, ...notas, alertas };
}
