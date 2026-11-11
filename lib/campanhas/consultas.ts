import { supabase } from "@/lib/supabase";
import { margemCampanha, type ResultadoMargem } from "@/lib/campanhas/margem";

// F3 — monta as entradas da margem para os itens de uma campanha e grava o resultado.
type J = Record<string, unknown>;
const n = (v: unknown) => Number(v || 0);

export type ItemCampanha = { id: string; item_id: string | null; model_id: string | null; sku: string | null; nome: string | null; preco_normal: number | null; preco_campanha: number | null; estoque_promocao: number | null; status: string | null; motivo_recusa: string | null; margem: number | null; margem_pct: number | null; calculado_em: string | null };

// Taxa de serviço média (%), frete médio do vendedor (R$/pedido) e imposto (%) da loja nos últimos 60 dias.
export async function parametrosLoja(lojaId: string): Promise<{ taxaServicoPct: number; freteMedio: number; impostoPct: number }> {
  const desde = new Date(Date.now() - 60 * 86400000).toISOString();
  const { data: ordens } = await supabase.from("pedidos").select("pedido_externo_id").eq("loja_id", lojaId).eq("marketplace", "shopee").eq("pedido_efetivado", true).gte("data_pedido", desde).limit(2000);
  const sns = (ordens || []).map((o) => o.pedido_externo_id as string);
  let taxaServicoPct = 0;
  let freteMedio = 0;
  if (sns.length) {
    const { data: linhas } = await supabase.from("custos_pedido").select("order_sn, categoria, campo, valor, soma").eq("loja_id", lojaId).in("order_sn", sns.slice(0, 1000)).in("categoria", ["receita", "serv_transacao", "serv_item", "serv_outros", "frete"]);
    let venda = 0;
    let servico = 0;
    let frete = 0;
    const pedidosComFrete = new Set<string>();
    for (const l of linhas || []) {
      if (l.categoria === "receita") venda += n(l.valor);
      else if (l.categoria.startsWith("serv_")) servico += Math.abs(n(l.valor));
      else if (l.categoria === "frete" && l.soma) {
        frete += n(l.valor);
        pedidosComFrete.add(l.order_sn);
      }
    }
    taxaServicoPct = venda > 0 ? (servico / venda) * 100 : 0;
    freteMedio = pedidosComFrete.size ? Math.abs(Math.min(0, frete)) / pedidosComFrete.size : 0;
  }
  // imposto: último mês lançado em `impostos` ÷ receita efetivada do mês (resumo_financas)
  let impostoPct = 0;
  const { data: loja } = await supabase.from("lojas").select("conta_id").eq("id", lojaId).maybeSingle();
  if (loja?.conta_id) {
    const { data: imp } = await supabase.from("impostos").select("competencia, valor").eq("conta_id", loja.conta_id).order("competencia", { ascending: false }).limit(1).maybeSingle();
    if (imp?.competencia) {
      const [a, m] = String(imp.competencia).split("-").map(Number);
      if (a && m) {
        const ini = new Date(Date.UTC(a, m - 1, 1, 3)).toISOString();
        const fim = new Date(Date.UTC(a, m, 1, 3)).toISOString();
        const { data: res } = await supabase.rpc("resumo_financas", { p_loja_ids: null, p_inicio: ini, p_fim: fim, p_conta: loja.conta_id });
        const receita = n((res as J)?.receita_bruta);
        if (receita > 0) impostoPct = (n(imp.valor) / receita) * 100;
      }
    }
  }
  if (!impostoPct) {
    const { data: cfg } = await supabase.from("configuracoes").select("valor").eq("chave", `campanhas_imposto_pct:${loja?.conta_id ?? ""}`).maybeSingle();
    impostoPct = Number(cfg?.valor) || 0;
  }
  return { taxaServicoPct: round(taxaServicoPct), freteMedio: round(freteMedio), impostoPct: round(impostoPct) };
}

async function custoDoItem(lojaId: string, sku: string | null, itemId: string | null, modelId: string | null): Promise<number | null> {
  const candidatos = [sku].filter((s): s is string => !!s);
  if (candidatos.length) {
    const { data: c } = await supabase.from("catalogo_sku").select("custo").in("sku", candidatos).not("custo", "is", null).limit(1).maybeSingle();
    if (c?.custo != null) return n(c.custo);
    const { data: cv } = await supabase.from("custos_variacao").select("custo").eq("loja_id", lojaId).in("model_sku", candidatos).limit(1).maybeSingle();
    if (cv?.custo != null) return n(cv.custo);
    const { data: p } = await supabase.from("produtos").select("custo").eq("loja_id", lojaId).in("sku", candidatos).not("custo", "is", null).limit(1).maybeSingle();
    if (p?.custo != null) return n(p.custo);
  }
  if (itemId) {
    const { data: pv } = await supabase.from("produto_variacoes").select("model_sku").eq("loja_id", lojaId).eq("item_id", itemId).eq("model_id", Number(modelId) || 0).maybeSingle();
    if (pv?.model_sku) return custoDoItem(lojaId, pv.model_sku, null, null);
    const { data: p } = await supabase.from("produtos").select("custo").eq("loja_id", lojaId).eq("item_id", itemId).not("custo", "is", null).limit(1).maybeSingle();
    if (p?.custo != null) return n(p.custo);
  }
  return null;
}

async function afiliadoPct(lojaId: string, itemId: string | null): Promise<number> {
  if (!itemId) return 0;
  const { data } = await supabase.from("afiliados_item_taxa").select("taxa").eq("loja_id", lojaId).eq("item_id", Number(itemId)).order("coletado_em", { ascending: false }).limit(1).maybeSingle();
  return Number(data?.taxa || 0);
}

export async function calcularMargensCampanha(campanhaId: string): Promise<{ itens: (ItemCampanha & { resultado: ResultadoMargem })[]; negativos: number; parametros: Awaited<ReturnType<typeof parametrosLoja>> | null }> {
  const { data: camp } = await supabase.from("campanhas").select("id, canal, loja_id, inicio").eq("id", campanhaId).maybeSingle();
  if (!camp?.loja_id) return { itens: [], negativos: 0, parametros: null };
  const canal = camp.canal === "tiktok" ? "tiktok" : "shopee";
  const dia = (camp.inicio ? new Date(camp.inicio) : new Date()).toISOString().slice(0, 10);
  const params = await parametrosLoja(camp.loja_id);
  const { data: itens } = await supabase.from("campanha_itens").select("*").eq("campanha_id", campanhaId).limit(500);
  const saida: (ItemCampanha & { resultado: ResultadoMargem })[] = [];
  let negativos = 0;
  for (const it of (itens || []) as ItemCampanha[]) {
    const preco = Number(it.preco_campanha || 0);
    let comissaoShopee: number | null = null;
    if (canal === "shopee" && preco > 0) {
      const { data } = await supabase.rpc("shopee_taxa_esperada_item", { preco, dia });
      comissaoShopee = data == null ? null : Number(data);
    }
    const [custo, aff] = await Promise.all([custoDoItem(camp.loja_id, it.sku, it.item_id, it.model_id), afiliadoPct(camp.loja_id, it.item_id)]);
    const r = margemCampanha({ canal, precoCampanha: preco, comissaoShopee, taxaServicoPct: params.taxaServicoPct, afiliadoPct: aff, freteMedio: params.freteMedio, impostoPct: params.impostoPct, custo });
    if (r.margem !== null && r.margem < 0) negativos++;
    await supabase.from("campanha_itens").update({ margem: r.margem, margem_pct: r.pct, calculado_em: new Date().toISOString() }).eq("id", it.id);
    saida.push({ ...it, margem: r.margem, margem_pct: r.pct, resultado: r });
  }
  return { itens: saida, negativos, parametros: params };
}

const round = (v: number) => Math.round(v * 100) / 100;
