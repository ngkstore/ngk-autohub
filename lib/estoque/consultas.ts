import { supabase } from "@/lib/supabase";
import { acabaEm, coberturaDias, disponivelKit, fatorDoPeriodo, pontoPedido, quantidadeComprar, statusSku, vendaMediaDia, vendaPerdida, type Status } from "@/lib/estoque/calculo";

// D3/D5 — monta a tabela de estoque: físico (UpSeller), por plataforma, venda média,
// cobertura, ponto de pedido, compra sugerida e status, com kits explodidos.
export type LinhaEstoque = {
  sku: string;
  nome: string | null;
  tipo: "unico" | "variacao" | "kit";
  fisico: number;
  emTransito: number;
  shopee: number | null;
  tiktok: number | null;
  vendaDia: number;
  v7: number;
  v28: number;
  v30: number;
  cobertura: number | null;
  pontoPedido: number;
  comprar: number;
  status: Status;
  acabaEm: string | null;
  vendaPerdida: number;
  custo: number | null;
  valorParado: number;
  fornecedor: string | null;
  fornecedorId: string | null;
  prazoDias: number;
  segurancaDias: number;
  caixa: number | null;
  precoMedio: number;
  kitsAfetados: string[];
  componentes?: { sku: string; quantidade: number; disponivel: number }[];
};

const DIAS_DESEJADOS = 30;
const n = (v: unknown) => Number(v || 0);
const iso = (d: Date) => d.toISOString().slice(0, 10);

export async function montarEstoque(lojaIds: string[] | null): Promise<{ linhas: LinhaEstoque[]; temUpseller: boolean; coletadoEm: string | null; fatorAtual: number; dataMaisAntiga: string | null }> {
  const hoje = new Date();
  const d7 = new Date(hoje.getTime() - 7 * 86400000);
  const d28 = new Date(hoje.getTime() - 28 * 86400000);
  const d30 = new Date(hoje.getTime() - 30 * 86400000);
  const anoIni = new Date(d28.getTime() - 365 * 86400000);
  const anoFim = new Date(hoje.getTime() - 365 * 86400000);

  const [{ data: est }, { data: cat }, { data: kits }, { data: forn }, { data: exc }, { data: fat }, { data: compras }, v7, v28, v30, vAno, { data: maisAntigo }, { data: lojasRows }] = await Promise.all([
    supabase.from("estoque_armazem").select("sku, disponivel, ocupado, em_transito, atual, custo_medio, coletado_em").limit(20000),
    supabase.from("catalogo_sku").select("sku, nome, tipo, custo, fornecedor_id, caixa, ativo").limit(20000),
    supabase.from("kit_componentes").select("sku_kit, sku_componente, quantidade").limit(20000),
    supabase.from("fornecedores").select("id, nome, prazo_dias, seguranca_dias, caixa_padrao"),
    supabase.from("fornecedor_sku_excecao").select("sku, fornecedor_id, prazo_dias, seguranca_dias, caixa"),
    supabase.from("estoque_fator_sazonal").select("inicio, fim, fator"),
    supabase.from("compras_a_caminho").select("sku, quantidade").eq("recebido", false),
    supabase.rpc("vendas_por_sku_armazem", { p_inicio: iso(d7), p_fim: iso(new Date(hoje.getTime() + 86400000)), p_loja_ids: lojaIds }),
    supabase.rpc("vendas_por_sku_armazem", { p_inicio: iso(d28), p_fim: iso(new Date(hoje.getTime() + 86400000)), p_loja_ids: lojaIds }),
    supabase.rpc("vendas_por_sku_armazem", { p_inicio: iso(d30), p_fim: iso(new Date(hoje.getTime() + 86400000)), p_loja_ids: lojaIds }),
    supabase.rpc("vendas_por_sku_armazem", { p_inicio: iso(anoIni), p_fim: iso(anoFim), p_loja_ids: lojaIds }),
    supabase.from("pedido_itens").select("dia").order("dia", { ascending: true }).limit(1).maybeSingle(),
    supabase.from("lojas").select("id, marketplace"),
  ]);
  const temAnoAnterior = !!maisAntigo?.dia && String(maisAntigo.dia) <= iso(anoIni);
  const fatorAtual = temAnoAnterior ? 1 : fatorDoPeriodo((fat || []) as { inicio: string; fim: string; fator: number }[], hoje);
  const mapa = (r: unknown) => new Map(((r as { sku_armazem: string; qtd: number; receita: number }[]) || []).map((x) => [x.sku_armazem, { qtd: n(x.qtd), receita: n(x.receita) }]));
  const m7 = mapa(v7.data);
  const m28 = mapa(v28.data);
  const m30 = mapa(v30.data);
  const mAno = mapa(vAno.data);

  // estoque físico por SKU (soma dos armazéns)
  const fisico = new Map<string, { disp: number; transito: number; custo: number | null; coletado: string }>();
  for (const e of est || []) {
    const f = fisico.get(e.sku) || { disp: 0, transito: 0, custo: null, coletado: e.coletado_em };
    f.disp += n(e.disponivel);
    f.transito += n(e.em_transito);
    if (e.custo_medio != null) f.custo = n(e.custo_medio);
    fisico.set(e.sku, f);
  }
  const temUpseller = fisico.size > 0;
  const coletadoEm = (est || []).reduce<string | null>((m, e) => (!m || e.coletado_em > m ? e.coletado_em : m), null);
  const transitoCompras = new Map<string, number>();
  for (const c of compras || []) transitoCompras.set(c.sku, (transitoCompras.get(c.sku) || 0) + n(c.quantidade));

  // estoque das plataformas: produto_variacoes (Shopee pelo get_model_list; TikTok pelo inventory/search),
  // ligado ao SKU do armazém pelo mapeamento (item/variação do UpSeller ou SKU do anúncio da planilha).
  const canalDaLoja = new Map<string, string>((lojasRows || []).map((l) => [l.id as string, l.marketplace === "tiktok_shop" ? "tiktok" : "shopee"]));
  let qv = supabase.from("produto_variacoes").select("loja_id, item_id, model_id, model_sku, estoque").limit(20000);
  if (lojaIds) qv = qv.in("loja_id", lojaIds);
  const { data: varia } = await qv;
  const { data: mapeamentos } = await supabase.from("catalogo_mapeamento").select("sku_anuncio, sku_armazem, loja_id, item_id, model_id").limit(20000);
  const mapAnuncio = new Map<string, string>();
  const mapItem = new Map<string, string>();
  for (const m of mapeamentos || []) {
    if (m.sku_anuncio) mapAnuncio.set(`${m.loja_id}|${m.sku_anuncio}`, m.sku_armazem);
    if (m.item_id) mapItem.set(`${m.loja_id}|${m.item_id}|${m.model_id || ""}`, m.sku_armazem);
  }
  const shopee = new Map<string, number>();
  const tiktok = new Map<string, number>();
  for (const v of varia || []) {
    const sku = mapItem.get(`${v.loja_id}|${v.item_id}|${v.model_id === "0" ? "" : v.model_id || ""}`) || (v.model_sku ? mapAnuncio.get(`${v.loja_id}|${v.model_sku}`) : null) || v.model_sku;
    if (!sku) continue;
    const alvo = canalDaLoja.get(v.loja_id) === "tiktok" ? tiktok : shopee;
    alvo.set(sku, (alvo.get(sku) || 0) + n(v.estoque));
  }

  const fornecedores = new Map((forn || []).map((f) => [f.id, f]));
  const excecoes = new Map((exc || []).map((e) => [e.sku, e]));
  const catalogo = new Map((cat || []).map((c) => [c.sku, c]));
  const kitsPorKit = new Map<string, { sku: string; quantidade: number }[]>();
  const kitsPorComponente = new Map<string, string[]>();
  for (const k of kits || []) {
    kitsPorKit.set(k.sku_kit, [...(kitsPorKit.get(k.sku_kit) || []), { sku: k.sku_componente, quantidade: n(k.quantidade) }]);
    kitsPorComponente.set(k.sku_componente, [...(kitsPorComponente.get(k.sku_componente) || []), k.sku_kit]);
  }

  const todos = new Set<string>([...fisico.keys(), ...catalogo.keys(), ...m30.keys()]);
  todos.delete("");
  const linhas: LinhaEstoque[] = [];
  for (const sku of todos) {
    const c = catalogo.get(sku);
    if (c && c.ativo === false) continue;
    const tipo = (c?.tipo as LinhaEstoque["tipo"]) || (kitsPorKit.has(sku) ? "kit" : "unico");
    const ex = excecoes.get(sku);
    const fId = ex?.fornecedor_id || c?.fornecedor_id || null;
    const f = fId ? fornecedores.get(fId) : null;
    const prazoDias = ex?.prazo_dias ?? f?.prazo_dias ?? 15;
    const segurancaDias = ex?.seguranca_dias ?? f?.seguranca_dias ?? 5;
    const caixa = ex?.caixa ?? c?.caixa ?? f?.caixa_padrao ?? null;
    const comps = kitsPorKit.get(sku);
    const fis = fisico.get(sku);
    let disponivel = fis?.disp ?? 0;
    let componentes: LinhaEstoque["componentes"];
    if (tipo === "kit" && comps?.length) {
      componentes = comps.map((k) => ({ ...k, disponivel: fisico.get(k.sku)?.disp ?? 0 }));
      // o UpSeller informa o estoque do kit montado; sem isso, o menor componente ÷ quantidade
      disponivel = fis ? fis.disp : disponivelKit(componentes);
    }
    const emTransito = (fis?.transito ?? 0) + (transitoCompras.get(sku) || 0);
    const s7 = m7.get(sku)?.qtd ?? 0;
    const s28 = m28.get(sku)?.qtd ?? 0;
    const s30 = m30.get(sku)?.qtd ?? 0;
    const sAno = temAnoAnterior ? (mAno.get(sku)?.qtd ?? 0) : null;
    const vendaDia = vendaMediaDia({ v7: s7, v28: s28, vAnoAnterior: sAno }, fatorAtual);
    const precoMedio = s30 > 0 ? (m30.get(sku)?.receita ?? 0) / s30 : 0;
    const custo = c?.custo ?? fis?.custo ?? null;
    const semLigacao = temUpseller && !fis && !c && !(tipo === "kit" && comps?.length);
    const status: Status = semLigacao ? "mapear" : temUpseller || fis ? statusSku(disponivel, vendaDia, s30, prazoDias, segurancaDias) : vendaDia > 0 ? "ok" : "parado";
    if (tipo === "kit" && !fis && !componentes?.length) continue; // kit sem estoque próprio e sem composição: nada a mostrar
    const acaba = acabaEm(disponivel, vendaDia, hoje);
    linhas.push({
      sku,
      nome: c?.nome ?? null,
      tipo,
      fisico: disponivel,
      emTransito,
      shopee: shopee.has(sku) ? shopee.get(sku)! : null,
      tiktok: tiktok.has(sku) ? tiktok.get(sku)! : null,
      vendaDia,
      v7: s7,
      v28: s28,
      v30: s30,
      cobertura: coberturaDias(disponivel, vendaDia),
      pontoPedido: pontoPedido(vendaDia, prazoDias, segurancaDias),
      comprar: status === "mapear" ? 0 : quantidadeComprar(vendaDia, disponivel, emTransito, { prazoDias, segurancaDias, diasDesejados: DIAS_DESEJADOS, caixa, fatorSazonal: fatorAtual }),
      status,
      acabaEm: acaba ? acaba.toISOString() : null,
      vendaPerdida: status === "mapear" ? 0 : vendaPerdida(vendaDia, disponivel, prazoDias, precoMedio),
      custo,
      valorParado: status === "excesso" || status === "parado" ? disponivel * (custo || 0) : 0,
      fornecedor: f?.nome ?? null,
      fornecedorId: fId,
      prazoDias,
      segurancaDias,
      caixa,
      precoMedio,
      kitsAfetados: kitsPorComponente.get(sku) || [],
      componentes,
    });
  }
  // nomes repetidos (variações com o mesmo título no UpSeller, ex.: 4 cores de MINISKATE): põe o SKU no nome
  const porNome = new Map<string, number>();
  for (const l of linhas) if (l.nome) porNome.set(l.nome, (porNome.get(l.nome) || 0) + 1);
  for (const l of linhas) if (l.nome && (porNome.get(l.nome) || 0) > 1) l.nome = `${l.nome} · ${l.sku}`;
  linhas.sort((a, b) => (a.cobertura ?? 1e9) - (b.cobertura ?? 1e9));
  return { linhas, temUpseller, coletadoEm, fatorAtual, dataMaisAntiga: maisAntigo?.dia ? String(maisAntigo.dia) : null };
}
