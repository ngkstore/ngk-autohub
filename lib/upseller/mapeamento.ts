import { supabase } from "@/lib/supabase";
import { mcpTool, upsellerConfigurado } from "@/lib/upseller/cliente";
import { normSku } from "@/lib/estoque/consultas";

type J = Record<string, unknown>;

// Mapeamento anúncio (item/variação da plataforma) → SKU do armazém, a partir do UpSeller.
// page_product_sales_by_variation devolve, por loja, productId/variationId da plataforma e o SKU
// com que o anúncio estava cadastrado NA HORA DA VENDA (pode vir mais de um texto por anúncio quando
// o SKU foi renomeado, ex.: BLÇCZN10BR e BLCCZN10BR1). Regra: para cada item/variação fica o SKU que
// EXISTE no armazém (comparado sem acento/cedilha); entre vários, o mais vendido. Sem nenhum no
// armazém, fica o mais vendido e o anúncio aparece em "Sem mapeamento" na tela Estoque.
export async function importarMapeamentoUpseller(semanas = 4): Promise<{ linhas: number; gravadas: number; lojasSemVinculo: string[]; erro?: string }> {
  if (!upsellerConfigurado().mcp) return { linhas: 0, gravadas: 0, lojasSemVinculo: [], erro: "UPSELLER_MCP_TOKEN ausente." };
  const { data: vinc } = await supabase.from("upseller_lojas").select("upseller_shop_id, loja_id, plataforma");
  const porShop = new Map<string, { loja_id: string | null; plataforma: string | null }>();
  for (const v of vinc || []) porShop.set(String(v.upseller_shop_id), { loja_id: v.loja_id, plataforma: v.plataforma });

  const dia = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const hoje = new Date();
  const { data: arm } = await supabase.from("estoque_armazem").select("sku").limit(20000);
  const noArmazem = new Set((arm || []).map((e) => normSku(e.sku)));
  const linhas = new Map<string, J & { _existe: boolean; _un: number }>();
  const semVinculo = new Set<string>();
  // da semana mais ANTIGA para a mais recente: a última gravada prevalece (o SKU do anúncio pode ter mudado)
  for (let s = semanas - 1; s >= 0; s--) {
    const fim = new Date(hoje.getTime() - (s * 7 + 1) * 86400000);
    const ini = new Date(fim.getTime() - 6 * 86400000);
    for (let pageNum = 1; pageNum <= 60; pageNum++) {
      const r = await mcpTool<J>("page_product_sales_by_variation", { request: { beginDate: dia(ini), endDate: dia(fim), pageNum, pageSize: 50 } });
      if (Number(r.code) !== 0) throw new Error(`page_product_sales_by_variation: ${r.code} ${r.message}`);
      const data = (r.data as J) || {};
      const lista = (data.list as J[]) || [];
      for (const row of lista) {
        const shop = String(row.shopId ?? "");
        const v = porShop.get(shop);
        if (!v?.loja_id) {
          if (shop) semVinculo.add(`${shop} ${String(row.shopName ?? "")} (${String(row.platform ?? "")})`);
          continue;
        }
        const itemId = String(row.productId ?? "").trim();
        const modelId = String(row.variationId ?? "").trim();
        const skuArmazem = String(row.variationSku || row.productSku || "").trim().toUpperCase();
        // modelo sem SKU próprio: o UpSeller repete o SKU do produto
        if (!itemId || !skuArmazem) continue;
        const canal = v.plataforma === "tiktok" ? "tiktok" : "shopee";
        const chave = `${canal}|${v.loja_id}|${itemId}|${modelId}`;
        const existe = noArmazem.has(normSku(skuArmazem));
        const un = Number(row.unitsSold || row.validOrders || 0);
        const prev = linhas.get(chave);
        if (prev && (prev._existe && !existe)) continue;
        if (prev && prev._existe === existe && prev._un > un) continue;
        linhas.set(chave, { canal, loja_id: v.loja_id, item_id: itemId, model_id: modelId, sku_armazem: skuArmazem, nome_produto: String(row.productName ?? "").slice(0, 200) || null, _existe: existe, _un: un });
      }
      const total = Number(data.total || 0);
      if (lista.length < 50 || pageNum * 50 >= total) break;
    }
  }
  const todas = [...linhas.values()].map(({ _existe, _un, ...l }) => {
    void _existe;
    void _un;
    return l;
  });
  let gravadas = 0;
  for (let i = 0; i < todas.length; i += 500) {
    const { data, error } = await supabase.rpc("mapeamento_upsert_upseller", { p_linhas: todas.slice(i, i + 500) });
    if (error) throw new Error(`mapeamento_upsert_upseller: ${error.message}`);
    gravadas += Number(data || 0);
  }
  return { linhas: todas.length, gravadas, lojasSemVinculo: [...semVinculo] };
}
