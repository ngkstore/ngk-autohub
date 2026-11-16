import { supabase } from "@/lib/supabase";

// Consultas da tela /creators (servidor; filtradas pelas lojas do escopo).
export type AmostraResumo = {
  loja_id: string;
  amostra_id: string;
  criador_id: string | null;
  criador_usuario: string | null;
  criador_nome: string | null;
  produto_id: string | null;
  produto_nome: string | null;
  sku_nome: string | null;
  status: string | null;
  is_approvable: boolean;
  pedido_em: string | null;
  expira_em: string | null;
  taxa_comissao: number | null;
  custo_amostra: number | null;
  nota: number | null;
  nota_motivos: { pontos?: Record<string, number>; detalhe?: string[] } | null;
  sugestao: string | null;
  decisao: string | null;
  decidido_por: string | null;
};

export async function listarAmostrasPendentes(lojaIds: string[] | null): Promise<AmostraResumo[]> {
  let q = supabase.from("tiktok_amostras").select("loja_id, amostra_id, criador_id, criador_usuario, criador_nome, produto_id, produto_nome, sku_nome, status, is_approvable, pedido_em, expira_em, taxa_comissao, custo_amostra, nota, nota_motivos, sugestao, decisao, decidido_por").eq("status", "PENDING").order("expira_em", { ascending: true, nullsFirst: false }).limit(1000);
  if (lojaIds) q = q.in("loja_id", lojaIds);
  const { data } = await q;
  return ((data || []) as unknown) as AmostraResumo[];
}

export type ProdutoParado = { loja_id: string; produto_id: string; nome: string | null; categoria_id: string | null; sku_armazem: string | null; estoque: number; vendas_28d: number; pedidos_28d: number | null; views_28d: number | null; parado: boolean; amostras_pendentes: number; calculado_em: string };

export async function listarProdutosParados(lojaIds: string[] | null): Promise<ProdutoParado[]> {
  let q = supabase.from("tiktok_produtos_parados").select("*").eq("parado", true).order("estoque", { ascending: false }).limit(500);
  if (lojaIds) q = q.in("loja_id", lojaIds);
  const { data } = await q;
  return ((data || []) as unknown) as ProdutoParado[];
}

export type CriadorSugerido = { criador_id: string; usuario: string | null; nome: string | null; nivel: number | null; seguidores: number | null; gmv: number | null; media_views_video: number | null; taxa_cumprimento: number | null; categorias: string[]; vendeu_aqui: number; fonte: "vendas" | "marketplace" };

// 20 melhores criadores para um produto: base própria (quem mais vendeu para a loja) + criadores com a categoria do produto.
export async function criadoresParaProduto(lojaId: string, categoriaId: string | null): Promise<CriadorSugerido[]> {
  const [{ data: vendas }, { data: criadores }] = await Promise.all([
    supabase.from("tiktok_afiliado_pedidos").select("criador_id, base_comissao").eq("loja_id", lojaId).not("criador_id", "is", null).gte("criado_em", new Date(Date.now() - 90 * 86400000).toISOString()).limit(50000),
    supabase.from("tiktok_criadores").select("criador_id, usuario, nome, nivel, seguidores, gmv, media_views_video, taxa_cumprimento, categorias").limit(20000),
  ]);
  const vendeu = new Map<string, number>();
  for (const v of vendas || []) vendeu.set(v.criador_id as string, (vendeu.get(v.criador_id as string) || 0) + Number(v.base_comissao || 0));
  const lista: CriadorSugerido[] = [];
  for (const c of criadores || []) {
    const cats = Array.isArray(c.categorias) ? (c.categorias as string[]) : [];
    const v = vendeu.get(c.criador_id) || 0;
    const catOk = !!categoriaId && cats.includes(categoriaId);
    if (!v && !catOk) continue;
    lista.push({ criador_id: c.criador_id, usuario: c.usuario, nome: c.nome, nivel: c.nivel, seguidores: c.seguidores, gmv: c.gmv == null ? null : Number(c.gmv), media_views_video: c.media_views_video == null ? null : Number(c.media_views_video), taxa_cumprimento: c.taxa_cumprimento == null ? null : Number(c.taxa_cumprimento), categorias: cats, vendeu_aqui: v, fonte: v ? "vendas" : "marketplace" });
  }
  // ordena: quem já vendeu (por valor), depois por GMV e views
  lista.sort((a, b) => b.vendeu_aqui - a.vendeu_aqui || (b.gmv || 0) - (a.gmv || 0) || (b.media_views_video || 0) - (a.media_views_video || 0));
  return lista.slice(0, 20);
}

export type ResultadoLinha = { chave: string; nome: string; amostras_enviadas: number; videos: number; pedidos: number; gmv: number; comissao: number; custo_amostras: number };

// Resultado por produto e por criador: amostras enviadas, vídeos publicados, pedidos/GMV/comissão gerados, custo das amostras.
export async function resultadoCreators(lojaIds: string[] | null): Promise<{ porProduto: ResultadoLinha[]; porCriador: ResultadoLinha[] }> {
  let qa = supabase.from("tiktok_amostras").select("loja_id, amostra_id, criador_id, criador_usuario, produto_id, produto_nome, status, custo_amostra").neq("status", "PENDING").limit(5000);
  if (lojaIds) qa = qa.in("loja_id", lojaIds);
  let qp = supabase.from("tiktok_afiliado_pedidos").select("loja_id, criador_id, criador_usuario, sku_id, base_comissao, comissao_estimada, comissao_paga, bruto").gte("criado_em", new Date(Date.now() - 90 * 86400000).toISOString()).limit(50000);
  if (lojaIds) qp = qp.in("loja_id", lojaIds);
  const [{ data: amostras }, { data: envios }, { data: pedidos }] = await Promise.all([qa, supabase.from("tiktok_amostra_envios").select("loja_id, amostra_id, conteudo_publicado"), qp]);
  const enviadas = new Set((envios || []).map((e) => `${e.loja_id}|${e.amostra_id}`));
  const comVideo = new Set((envios || []).filter((e) => e.conteudo_publicado).map((e) => `${e.loja_id}|${e.amostra_id}`));
  const porProduto = new Map<string, ResultadoLinha>();
  const porCriador = new Map<string, ResultadoLinha>();
  const linha = (m: Map<string, ResultadoLinha>, chave: string, nome: string) => {
    const l = m.get(chave) || { chave, nome, amostras_enviadas: 0, videos: 0, pedidos: 0, gmv: 0, comissao: 0, custo_amostras: 0 };
    m.set(chave, l);
    return l;
  };
  const skuProduto = new Map<string, string>();
  for (const a of amostras || []) {
    const k = `${a.loja_id}|${a.amostra_id}`;
    const aprovada = ["APPROVED", "SHIPPED", "DELIVERED", "COMPLETED", "FULFILLED"].includes(String(a.status));
    if (!aprovada) continue;
    const lp = linha(porProduto, a.produto_id || "?", a.produto_nome || a.produto_id || "?");
    const lc = linha(porCriador, a.criador_id || a.criador_usuario || "?", a.criador_usuario || a.criador_id || "?");
    for (const l of [lp, lc]) {
      if (enviadas.has(k) || aprovada) l.amostras_enviadas++;
      if (comVideo.has(k)) l.videos++;
      l.custo_amostras += Number(a.custo_amostra || 0);
    }
  }
  for (const p of pedidos || []) {
    const prodId = String(((p.bruto as Record<string, unknown> | null)?.skus as Record<string, unknown>[] | undefined)?.[0]?.product_id ?? skuProduto.get(p.sku_id) ?? "");
    const lc = porCriador.get(p.criador_id || "") || porCriador.get(p.criador_usuario || "");
    if (lc) {
      lc.pedidos++;
      lc.gmv += Number(p.base_comissao || 0);
      lc.comissao += Number(p.comissao_paga ?? p.comissao_estimada ?? 0);
    }
    const lp = prodId ? porProduto.get(prodId) : undefined;
    if (lp) {
      lp.pedidos++;
      lp.gmv += Number(p.base_comissao || 0);
      lp.comissao += Number(p.comissao_paga ?? p.comissao_estimada ?? 0);
    }
  }
  const ord = (m: Map<string, ResultadoLinha>) => [...m.values()].sort((a, b) => b.gmv - a.gmv || b.amostras_enviadas - a.amostras_enviadas);
  return { porProduto: ord(porProduto), porCriador: ord(porCriador) };
}
