import { supabase } from "@/lib/supabase";
import { chamarAms, obterTokenAms, type TokenAms } from "@/lib/shopee/ams";

// Gestor de Afiliados — Fase 1: coleta diária do módulo AMS por loja.
// Guarda, por dia: loja, produto e afiliado (ConfirmedOrder/AllChannel);
// e a cada rodada: foto dos conteúdos (30d) e a taxa configurada por item.
// A API só aceita page_size <= 20 e dados até `last_report_date` (D-2).

const PAGINA = 20;
const BASE_Q = "&order_type=ConfirmedOrder&channel=AllChannel";

type Metrica = {
  sales?: string;
  orders?: number;
  items_sold?: number;
  gross_item_sold?: number;
  clicks?: number;
  est_commission?: string;
  roi?: string;
  total_buyers?: number;
  new_buyers?: number;
};

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

function metricas(m: Metrica) {
  return {
    vendas: num(m.sales),
    pedidos: num(m.orders),
    itens: num(m.items_sold ?? m.gross_item_sold),
    cliques: num(m.clicks),
    comissao: num(m.est_commission),
    roi: m.roi != null && m.roi !== "" ? num(m.roi) : null,
    compradores: num(m.total_buyers),
    novos_compradores: num(m.new_buyers),
  };
}

const ymd = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, "");
const iso = (ymdStr: string) => `${ymdStr.slice(0, 4)}-${ymdStr.slice(4, 6)}-${ymdStr.slice(6, 8)}`;
const diaQ = (dia: string) => `&period_type=Day&start_date=${dia}&end_date=${dia}${BASE_Q}`;

class ErroAms extends Error {}

function conferir(r: Record<string, unknown>, ep: string) {
  if (r.error) throw new ErroAms(`${ep}: ${r.error} | ${r.message || "-"}`);
  return (r.response || {}) as Record<string, unknown>;
}

// Percorre todas as páginas de um endpoint de lista (teto de segurança).
async function paginar<T>(tok: TokenAms, ep: string, q: string, maxPaginas: number): Promise<T[]> {
  const saida: T[] = [];
  for (let p = 1; p <= maxPaginas; p++) {
    const r = conferir(
      await chamarAms(`/api/v2/ams/${ep}`, tok, `${q}&page_no=${p}&page_size=${PAGINA}`),
      ep
    );
    const lista = (r.list || r.item_list || []) as T[];
    saida.push(...lista);
    if (!r.has_more || lista.length < PAGINA) break;
  }
  return saida;
}

export type ResultadoColeta = {
  lojaId: string;
  ultimoDia: string;
  diasColetados: string[];
  produtos: number;
  afiliados: number;
  conteudos: number;
  itensTaxa: number;
  erro?: string;
};

// `dias` = quantos dias pra trás (a partir de last_report_date) garantir no
// banco; só coleta os que ainda faltam. `maxDias` limita a rodada (rate limit).
export async function coletarAfiliados(
  lojaId: string,
  { dias = 3, maxDias = 10, conteudos = true, taxas = true } = {}
): Promise<ResultadoColeta> {
  const tok = await obterTokenAms(lojaId);
  if (!tok) throw new Error("loja sem o app de afiliados conectado");

  const upd = conferir(
    await chamarAms("/api/v2/ams/get_performance_data_update_time", tok, "&marker_type=AmsMarker"),
    "get_performance_data_update_time"
  );
  const ultimo = String(upd.last_report_date || "").replace(/-/g, "");
  if (!/^\d{8}$/.test(ultimo)) throw new Error(`last_report_date inválido: ${upd.last_report_date}`);

  // Dias que faltam (mais antigo primeiro).
  const fim = new Date(`${iso(ultimo)}T12:00:00Z`);
  const candidatos: string[] = [];
  for (let i = dias - 1; i >= 0; i--) candidatos.push(ymd(new Date(fim.getTime() - i * 864e5)));
  const { data: jaTem } = await supabase
    .from("afiliados_loja_dia")
    .select("data")
    .eq("loja_id", lojaId)
    .gte("data", iso(candidatos[0]))
    .lte("data", iso(ultimo));
  const tem = new Set((jaTem || []).map((r) => String(r.data).replace(/-/g, "")));
  const faltam = candidatos.filter((d) => !tem.has(d)).slice(0, maxDias);

  const res: ResultadoColeta = {
    lojaId,
    ultimoDia: iso(ultimo),
    diasColetados: [],
    produtos: 0,
    afiliados: 0,
    conteudos: 0,
    itensTaxa: 0,
  };
  const agora = new Date().toISOString();

  try {
    for (const dia of faltam) {
      const data = iso(dia);

      const loja = conferir(
        await chamarAms("/api/v2/ams/get_shop_performance", tok, diaQ(dia)),
        "get_shop_performance"
      ) as Metrica;

      const produtos = await paginar<Metrica & { item_id: number; item_name?: string }>(
        tok, "get_product_performance", diaQ(dia), 50
      );
      const afiliados = await paginar<
        Metrica & { affiliate_id: number; affiliate_name?: string; affiliate_username?: string }
      >(tok, "get_affiliate_performance", diaQ(dia), 100);

      if (produtos.length > 0) {
        const { error } = await supabase.from("afiliados_produto_dia").upsert(
          produtos.map((p) => ({
            loja_id: lojaId, data, item_id: p.item_id, item_name: p.item_name ?? null,
            ...metricas(p), coletado_em: agora,
          })),
          { onConflict: "loja_id,data,item_id" }
        );
        if (error) throw new Error(`afiliados_produto_dia: ${error.message}`);
      }
      if (afiliados.length > 0) {
        const { error } = await supabase.from("afiliados_afiliado_dia").upsert(
          afiliados.map((a) => ({
            loja_id: lojaId, data, affiliate_id: a.affiliate_id,
            affiliate_name: a.affiliate_name ?? null, affiliate_username: a.affiliate_username ?? null,
            ...metricas(a), coletado_em: agora,
          })),
          { onConflict: "loja_id,data,affiliate_id" }
        );
        if (error) throw new Error(`afiliados_afiliado_dia: ${error.message}`);
      }
      // A linha da loja por último: é ela que marca o dia como coletado.
      const { error } = await supabase
        .from("afiliados_loja_dia")
        .upsert({ loja_id: lojaId, data, ...metricas(loja), coletado_em: agora }, { onConflict: "loja_id,data" });
      if (error) throw new Error(`afiliados_loja_dia: ${error.message}`);

      res.diasColetados.push(data);
      res.produtos += produtos.length;
      res.afiliados += afiliados.length;
    }

    // Foto dos conteúdos dos últimos 30 dias (os 200 melhores por vendas).
    if (conteudos) {
      const ini = ymd(new Date(fim.getTime() - 29 * 864e5));
      const lista = await paginar<{
        content_id: string; content_title?: string; post_time?: number; affiliate_name?: string;
        affiliate_username?: string; products?: number; views?: number; likes?: number; comments?: number;
        sales?: string; orders?: number; items_sold?: number; channel?: string;
      }>(tok, "get_content_performance", `&period_type=Last30d&start_date=${ini}&end_date=${ultimo}${BASE_Q}`, 10);
      if (lista.length > 0) {
        const { error } = await supabase.from("afiliados_conteudo").upsert(
          lista.map((c) => ({
            loja_id: lojaId, content_id: String(c.content_id), titulo: c.content_title ?? null,
            publicado_em: c.post_time ? new Date(c.post_time * 1000).toISOString() : null,
            affiliate_name: c.affiliate_name ?? null, affiliate_username: c.affiliate_username ?? null,
            canal: c.channel ?? null, produtos: c.products ?? null,
            views: num(c.views), likes: num(c.likes), comentarios: num(c.comments),
            vendas: num(c.sales), pedidos: num(c.orders), itens: num(c.items_sold),
            janela_ini: iso(ini), janela_fim: iso(ultimo), coletado_em: agora,
          })),
          { onConflict: "loja_id,content_id" }
        );
        if (error) throw new Error(`afiliados_conteudo: ${error.message}`);
      }
      res.conteudos = lista.length;
    }

    // Taxa configurada por item (campanha aberta) + histórico diário.
    if (taxas) {
      const itens = await paginar<{
        item_id: number; item_name?: string; campaign_id?: number; campaign_status?: string;
        commission_rate?: number; max_commission_rate_current_day?: number;
        period_start_time?: number; period_end_time?: number;
      }>(tok, "get_open_campaign_added_product", "", 50);
      if (itens.length > 0) {
        const { error } = await supabase.from("afiliados_item_taxa").upsert(
          itens.map((i) => ({
            loja_id: lojaId, item_id: i.item_id, item_name: i.item_name ?? null,
            campaign_id: i.campaign_id ?? null, campaign_status: i.campaign_status ?? null,
            taxa: i.commission_rate ?? null, taxa_max_dia: i.max_commission_rate_current_day ?? null,
            periodo_ini: i.period_start_time ? new Date(i.period_start_time * 1000).toISOString() : null,
            periodo_fim: i.period_end_time && i.period_end_time < 4e9
              ? new Date(i.period_end_time * 1000).toISOString() : null,
            coletado_em: agora,
          })),
          { onConflict: "loja_id,item_id" }
        );
        if (error) throw new Error(`afiliados_item_taxa: ${error.message}`);
        const hoje = new Date().toISOString().slice(0, 10);
        await supabase.from("afiliados_item_taxa_hist").upsert(
          itens.map((i) => ({ loja_id: lojaId, item_id: i.item_id, data: hoje, taxa: i.commission_rate ?? null })),
          { onConflict: "loja_id,item_id,data" }
        );
      }
      res.itensTaxa = itens.length;
    }
  } catch (e) {
    // O que já foi gravado fica; o dia incompleto não tem linha da loja, então
    // volta a ser coletado na próxima rodada.
    res.erro = e instanceof Error ? e.message : String(e);
  }

  await supabase.from("sincronizacoes").insert({
    loja_id: lojaId,
    marketplace: "shopee",
    tipo: "afiliados",
    status: res.erro ? "erro" : "sucesso",
    registros_importados: res.produtos + res.afiliados,
    mensagem: res.erro
      ? `Afiliados: ${res.erro.slice(0, 200)}`
      : `Afiliados: ${res.diasColetados.length} dia(s) até ${res.ultimoDia}, ${res.produtos} produto-dia, ${res.afiliados} afiliado-dia, ${res.conteudos} conteúdos, ${res.itensTaxa} itens com taxa.`,
    iniciado_em: agora,
    finalizado_em: new Date().toISOString(),
  });

  return res;
}
