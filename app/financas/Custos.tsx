import { supabase } from "@/lib/supabase";

// Sub-aba "Custos Shopee": custo linha a linha em três camadas.
//  Camada 1 — detalhamento de cada pedido (escrow -> custos_pedido)
//  Camada 2 — carteira classificada por tipo (carteira_transacoes.categoria)
//  Camada 3 — custos fora da Shopee (CMV/impostos, já nas outras abas)
// + as conferências automáticas (OK / DIFERENÇA) da especificação de 09/11/2026.

type Periodo = { inicio: string; fim: string } | null;
type Json = Record<string, unknown>;

function brl(v: unknown) {
  return (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function n(v: unknown) {
  return Number(v || 0);
}
function int(v: unknown) {
  return (Number(v) || 0).toLocaleString("pt-BR");
}
function mesLabel(m: string) {
  return new Date(`${m}-01T12:00:00-03:00`).toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }).replace(".", "");
}
function dt(s: unknown) {
  return s ? new Date(String(s)).toLocaleDateString("pt-BR") : "—";
}

function Kpi({ label, val, hint, cor }: { label: string; val: string; hint?: string; cor?: string }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${cor || ""}`}>{val}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

function Status({ ok, texto }: { ok: boolean | null; texto: string }) {
  const cls = ok === null ? "bg-slate-800 text-slate-300" : ok ? "bg-emerald-900/50 text-emerald-300" : "bg-red-900/50 text-red-300";
  return <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${cls}`}>{texto}</span>;
}

// Categorias da Camada 1 na visão mensal (ordem e rótulo).
const CATS_PEDIDO: { k: string; r: string }[] = [
  { k: "receita", r: "Receita (preço de venda)" },
  { k: "desconto_pix", r: "Desconto Pix ao comprador" },
  { k: "cupom_vendedor", r: "Cupom do vendedor" },
  { k: "cupom_shopee", r: "Desconto da plataforma ressarcido / promos Shopee" },
  { k: "acao_comercial", r: "Participação em ação comercial (cupom/Pix do vendedor)" },
  { k: "frete", r: "Frete (líquido p/ vendedor)" },
  { k: "comissao", r: "Comissão bruta" },
  { k: "comissao_rebate", r: "Abatimento de comissão" },
  { k: "serv_transacao", r: "Taxa de transação" },
  { k: "serv_item", r: "Taxa por item vendido" },
  { k: "serv_afiliado", r: "Afiliado — taxa de serviço" },
  { k: "afiliado", r: "Afiliado — comissão" },
  { k: "serv_outros", r: "Taxa de serviço (regra nova)" },
  { k: "taxa_outros", r: "Outras taxas" },
  { k: "compensacao", r: "Compensações no pedido" },
  { k: "repasse", r: "= Renda do pedido (repasse)" },
];

export default async function Custos({ lojas, periodo, pedido }: { lojas: string[] | null; periodo: Periodo; pedido?: string }) {
  const args = { p_loja_ids: lojas, p_inicio: periodo?.inicio ?? null, p_fim: periodo?.fim ?? null };

  // Lojas com tabela de referência (conferência 3) dentro do escopo.
  let qRef = supabase.from("carteira_referencia").select("loja_id");
  if (lojas) qRef = qRef.in("loja_id", lojas);

  const [mensal, fecha, cart, afil, frete, desconhecidos, cobertura, refLojas, lojasNome, pedidoLinhas] = await Promise.all([
    supabase.rpc("custos_mensal", args),
    supabase.rpc("conferencia_pedido_fecha", { ...args, p_limite: 15 }),
    supabase.rpc("conferencia_pedido_carteira", { ...args, p_limite: 15 }),
    supabase.rpc("conferencia_afiliado_taxa", { ...args, p_limite: 15 }),
    supabase.rpc("conferencia_frete_vendedor", { ...args, p_limite: 15 }),
    supabase.rpc("conferencia_carteira_desconhecidos", { p_loja_ids: lojas }),
    supabase.rpc("cobertura_escrow_bruto", args),
    qRef,
    supabase.from("lojas").select("id, nome, apelido"),
    pedido ? supabase.rpc("custos_do_pedido", { p_order_sn: pedido.trim() }) : Promise.resolve({ data: null }),
  ]);

  const nomeLoja = new Map(((lojasNome.data as { id: string; nome: string; apelido: string | null }[]) || []).map((l) => [l.id, l.apelido || l.nome]));
  const refIds = Array.from(new Set(((refLojas.data as { loja_id: string }[]) || []).map((r) => r.loja_id)));
  const confMes = await Promise.all(refIds.map(async (id) => ({ id, rows: ((await supabase.rpc("conferencia_carteira_mes", { p_loja: id })).data as Json[]) || [] })));
  // Conferência 4: fatura mensal de afiliados × soma do detalhamento (lojas com fatura cadastrada).
  let qFat = supabase.from("afiliado_fatura").select("loja_id");
  if (lojas) qFat = qFat.in("loja_id", lojas);
  const fatIds = Array.from(new Set((((await qFat).data as { loja_id: string }[]) || []).map((r) => r.loja_id)));
  const confFat = await Promise.all(fatIds.map(async (id) => ({ id, rows: ((await supabase.rpc("conferencia_afiliado_fatura", { p_loja: id })).data as Json[]) || [] })));
  const fatTotal = confFat.reduce((s, x) => s + x.rows.length, 0);
  const fatOk = confFat.reduce((s, x) => s + x.rows.filter((r) => String(r.bate || "") !== "").length, 0);

  const m = (mensal.data as { pedido: Json[]; carteira: Json[] }) || { pedido: [], carteira: [] };
  const f = (fecha.data as Json) || {};
  const c = (cart.data as Json) || {};
  const a = (afil.data as Json) || {};
  const fr = (frete.data as Json) || {};
  const cob = (cobertura.data as Json) || {};
  const desc = (desconhecidos.data as Json[]) || [];
  const linhasPedido = (pedidoLinhas.data as Json[]) || [];

  // Pivot mensal Camada 1: mes -> categoria -> valor.
  const meses = Array.from(new Set([...(m.pedido || []).map((r) => String(r.mes)), ...(m.carteira || []).map((r) => String(r.mes))])).sort();
  const ped = new Map<string, Map<string, number>>();
  const pedidosMes = new Map<string, number>();
  for (const r of m.pedido || []) {
    const mes = String(r.mes), cat = String(r.categoria);
    if (!ped.has(mes)) ped.set(mes, new Map());
    ped.get(mes)!.set(cat, n(r.valor));
    if (cat === "repasse") pedidosMes.set(mes, n(r.pedidos));
  }
  const cartMes = new Map<string, Map<string, { v: number; r: string; q: number }>>();
  const catsCart = new Map<string, string>();
  for (const r of m.carteira || []) {
    const mes = String(r.mes), cat = String(r.categoria);
    if (["renda", "antecipacao", "saque", "emprestimo", "emprestimo_entrada", "pagamento_carteira"].includes(cat)) continue; // movimentação, não custo
    if (!cartMes.has(mes)) cartMes.set(mes, new Map());
    cartMes.get(mes)!.set(cat, { v: n(r.valor), r: String(r.rotulo || cat), q: n(r.qtd) });
    catsCart.set(cat, String(r.rotulo || cat));
  }

  const pctFecha = n(f.total) > 0 ? (n(f.ok) / n(f.total)) * 100 : null;
  const pctCob = n(cob.pedidos) > 0 ? (n(cob.com_detalhamento) / n(cob.pedidos)) * 100 : 0;
  const confMesTotal = confMes.reduce((s, x) => s + x.rows.length, 0);
  const confMesOk = confMes.reduce((s, x) => s + x.rows.filter((r) => r.ok).length, 0);

  const conferencias: { n: number; nome: string; ok: boolean | null; resumo: string; detalhe?: Json[] | null; colunas?: string[] }[] = [
    { n: 1, nome: "Pedido fecha (soma das linhas = Renda do pedido, R$ 0,01)", ok: n(f.total) === 0 ? null : n(f.diferenca) === 0, resumo: n(f.total) === 0 ? "ainda sem detalhamento no período" : `${int(f.ok)} de ${int(f.total)} fecham · ${int(f.diferenca)} com diferença (${brl(f.diferenca_valor)})`, detalhe: (f.exemplos as Json[]) || [], colunas: ["order_sn", "residual", "data"] },
    { n: 2, nome: "Pedido × carteira (Renda do pedido × tipo 101, R$ 0,01)", ok: n(c.total) === 0 ? null : n(c.diferenca) === 0, resumo: n(c.total) === 0 ? "—" : `${int(c.ok)} iguais · ${int(c.ok_com_ajuste)} iguais após ajuste 411/102 · ${int(c.sem_repasse)} ainda sem repasse · ${int(c.diferenca)} com diferença`, detalhe: (c.exemplos as Json[]) || [], colunas: ["order_sn", "repasse", "carteira", "ajustes", "acelera", "data"] },
    { n: 3, nome: "Mês × referência da Shopee (R$ 0,05)", ok: confMesTotal === 0 ? null : confMesOk === confMesTotal, resumo: confMesTotal === 0 ? "sem tabela de referência para estas lojas" : `${confMesOk} de ${confMesTotal} valores batem` },
    { n: 4, nome: "Afiliado × fatura mensal (1%)", ok: fatTotal === 0 ? null : (fatOk === fatTotal ? true : fatOk > 0 ? null : false), resumo: fatTotal === 0 ? "sem fatura cadastrada para estas lojas" : `${fatOk} de ${fatTotal} meses batem em alguma janela · depende da cobertura do detalhamento` },
    { n: 5, nome: "Taxa de serviço do afiliado ÷ comissão do afiliado (12% a 15%)", ok: n(a.pedidos_com_afiliado) === 0 ? null : n(a.fora_da_faixa) === 0, resumo: n(a.pedidos_com_afiliado) === 0 ? "—" : `${int(a.pedidos_com_afiliado)} pedidos · média ${n(a.razao_media).toFixed(2)}% · ${int(a.fora_da_faixa)} fora da faixa`, detalhe: (a.exemplos as Json[]) || [], colunas: ["order_sn", "comissao", "taxa", "razao", "data"] },
    { n: 6, nome: "Comissão × tabela vigente (R$ 0,02)", ok: null, resumo: "na aba Conciliação & Taxas (auditoria por pedido)" },
    { n: 7, nome: "Frete pago pelo vendedor (campo 50 ≠ 0)", ok: n(fr.pedidos) === 0 ? true : false, resumo: n(fr.pedidos) === 0 ? "nenhum pedido com frete por conta do vendedor" : `${int(fr.pedidos)} pedidos · custo ${brl(fr.custo_total)} · crédito ${brl(fr.credito_total)}`, detalhe: (fr.exemplos as Json[]) || [], colunas: ["order_sn", "frete", "data"] },
    { n: 8, nome: "Tipo de carteira desconhecido", ok: desc.length === 0, resumo: desc.length === 0 ? "todos os tipos classificados" : `${desc.length} tipo(s) sem classificação`, detalhe: desc, colunas: ["tipo", "descricao", "qtd", "total"] },
  ];

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Pedidos com detalhamento" val={`${pctCob.toFixed(0)}%`} hint={`${int(cob.com_detalhamento)} de ${int(cob.pedidos)} no período · o backfill roda a cada 10 min`} cor={pctCob >= 99 ? "text-emerald-300" : "text-blue-300"} />
        <Kpi label="Pedidos que fecham ao centavo" val={pctFecha === null ? "—" : `${pctFecha.toFixed(1)}%`} hint={n(f.diferenca) > 0 ? `${int(f.diferenca)} com resíduo` : "soma das linhas = renda do pedido"} cor={pctFecha !== null && pctFecha >= 99.5 ? "text-emerald-300" : "text-orange-300"} />
        <Kpi label="Carteira × referência" val={confMesTotal ? `${confMesOk}/${confMesTotal}` : "—"} hint="totais mensais da Shopee" cor={confMesTotal && confMesOk === confMesTotal ? "text-emerald-300" : "text-orange-300"} />
        <Kpi label="Afiliado (taxa ÷ comissão)" val={n(a.pedidos_com_afiliado) ? `${n(a.razao_media).toFixed(1)}%` : "—"} hint={`${int(a.pedidos_com_afiliado)} pedidos · esperado 12–15%`} cor="text-violet-300" />
      </div>

      {/* Consulta de um pedido */}
      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
        <h2 className="text-xl font-bold">Custos de um pedido</h2>
        <p className="mb-3 text-xs text-slate-500">Uma linha por campo do detalhamento da Shopee. A soma das linhas marcadas tem de dar a Renda do pedido.</p>
        <form method="get" action="/financas" className="flex flex-wrap gap-2">
          <input type="hidden" name="aba" value="custos" />
          <input name="pedido" defaultValue={pedido || ""} placeholder="order_sn, ex.: 2610083GS7UHXE" className="w-72 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm" />
          <button className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold">Ver linhas</button>
        </form>
        {pedido && linhasPedido.length === 0 && <p className="mt-3 text-sm text-orange-300">Pedido sem detalhamento guardado ainda (ou não é Shopee). O backfill pega os mais recentes primeiro.</p>}
        {linhasPedido.length > 0 && (
          <table className="mt-4 w-full text-sm">
            <thead className="text-left text-xs uppercase text-slate-500"><tr><th className="py-1">Grupo</th><th>Linha</th><th>Categoria</th><th className="text-right">R$</th><th className="text-center">Soma</th></tr></thead>
            <tbody className="divide-y divide-slate-800">
              {linhasPedido.map((l) => (
                <tr key={String(l.campo)} className={String(l.campo) === "repasse" ? "bg-slate-800 font-bold" : String(l.campo) === "residual" ? (Math.abs(n(l.valor)) > 0.01 ? "text-red-300" : "text-emerald-300") : ""}>
                  <td className="py-1 text-slate-400">{String(l.grupo)}</td>
                  <td>{String(l.rotulo)}</td>
                  <td className="text-slate-500">{String(l.categoria)}</td>
                  <td className={`text-right ${n(l.valor) < 0 ? "text-red-300" : ""}`}>{brl(l.valor)}</td>
                  <td className="text-center text-slate-500">{l.soma ? "✓" : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Conferências */}
      <section>
        <h2 className="mb-1 text-xl font-bold">Conferências automáticas</h2>
        <p className="mb-3 text-xs text-slate-500">Cada regra mostra OK ou DIFERENÇA, com o valor e os pedidos envolvidos.</p>
        <div className="space-y-3">
          {conferencias.map((cf) => (
            <details key={cf.n} className="rounded-xl border border-slate-800 bg-slate-900 p-4">
              <summary className="flex cursor-pointer flex-wrap items-center gap-3">
                <span className="text-slate-500">#{cf.n}</span>
                <span className="font-semibold">{cf.nome}</span>
                <Status ok={cf.ok} texto={cf.ok === null ? "PENDENTE" : cf.ok ? "OK" : "DIFERENÇA"} />
                <span className="text-xs text-slate-400">{cf.resumo}</span>
              </summary>
              {cf.n === 3 && confMes.length > 0 && (
                <div className="mt-3 space-y-3">
                  {confMes.map((x) => (
                    <div key={x.id}>
                      <p className="mb-1 text-xs font-semibold text-slate-300">{nomeLoja.get(x.id) || x.id}</p>
                      <table className="w-full text-xs">
                        <thead className="text-left text-slate-500"><tr><th>Mês</th><th>Chave</th><th className="text-right">Shopee</th><th className="text-right">AutoHub</th><th className="text-right">Diferença</th><th></th></tr></thead>
                        <tbody className="divide-y divide-slate-800">
                          {x.rows.map((r) => (
                            <tr key={`${r.mes}-${r.chave}`} className={r.ok ? "" : "text-orange-300"}>
                              <td className="py-0.5">{String(r.mes)}</td><td>{String(r.chave)}</td>
                              <td className="text-right">{brl(r.referencia)}</td><td className="text-right">{brl(r.autohub)}</td><td className="text-right">{brl(r.diferenca)}</td>
                              <td className="text-right">{r.ok ? "✓" : "✗"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}
                </div>
              )}
              {cf.detalhe && cf.detalhe.length > 0 && cf.colunas && (
                <table className="mt-3 w-full text-xs">
                  <thead className="text-left text-slate-500"><tr>{cf.colunas.map((k) => <th key={k} className="py-0.5">{k}</th>)}</tr></thead>
                  <tbody className="divide-y divide-slate-800">
                    {cf.detalhe.map((d, i) => (
                      <tr key={i}>
                        {cf.colunas!.map((k) => (
                          <td key={k} className="py-0.5 pr-3">
                            {k === "data" ? dt(d[k]) : typeof d[k] === "number" && !["qtd"].includes(k) ? (k === "razao" ? `${n(d[k]).toFixed(2)}%` : brl(d[k])) : typeof d[k] === "boolean" ? (d[k] ? "sim" : "não") : String(d[k] ?? "")}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {cf.n === 1 && Array.isArray(f.campos_desconhecidos) && (f.campos_desconhecidos as Json[]).length > 0 && (
                <p className="mt-2 text-xs text-orange-300">Regras de taxa de serviço sem classificação: {(f.campos_desconhecidos as Json[]).map((d) => `${d.rotulo} (${int(d.qtd)} · ${brl(d.total)})`).join("; ")}</p>
              )}
              {cf.n === 4 && (
                <div className="mt-2 space-y-3">
                  <p className="text-xs text-slate-400">A fatura mensal de afiliados é extrato, não cobrança extra: o afiliado já está descontado em cada pedido (comissão + taxa de serviço). Aqui ela só é comparada com a soma do detalhamento em três janelas (A: pedido no mês · B: pedido no mês anterior · C: repasse no mês) e duas somas (só comissão / comissão + taxa). "Cobertura" é a parte dos pedidos do mês que já tem detalhamento: abaixo de 100% a soma é parcial.</p>
                  {confFat.map((x) => (
                    <div key={x.id}>
                      <p className="mb-1 text-xs font-semibold text-slate-300">{nomeLoja.get(x.id) || x.id}</p>
                      <table className="w-full text-xs">
                        <thead className="text-left text-slate-500"><tr><th>Mês</th><th className="text-right">Fatura</th><th className="text-right">Cobertura</th><th className="text-right">A comissão</th><th className="text-right">A total</th><th className="text-right">B comissão</th><th className="text-right">B total</th><th className="text-right">C comissão</th><th className="text-right">C total</th><th>Bate</th></tr></thead>
                        <tbody className="divide-y divide-slate-800">
                          {x.rows.map((r) => (
                            <tr key={String(r.mes_validade)} className={String(r.bate || "") ? "text-emerald-300" : ""}>
                              <td className="py-0.5">{String(r.mes_validade)}</td><td className="text-right">{brl(r.despesa)}</td><td className="text-right">{n(r.cobertura).toFixed(0)}%</td>
                              <td className="text-right">{brl(r.a_comissao)}</td><td className="text-right">{brl(r.a_total)}</td><td className="text-right">{brl(r.b_comissao)}</td><td className="text-right">{brl(r.b_total)}</td><td className="text-right">{brl(r.c_comissao)}</td><td className="text-right">{brl(r.c_total)}</td>
                              <td className="text-slate-400">{String(r.bate || "—")}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}
                </div>
              )}
            </details>
          ))}
        </div>
      </section>

      {/* Visão mensal — Camada 1 */}
      <section className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900 p-6">
        <h2 className="text-xl font-bold">Por pedido, mês a mês (competência = data do pedido)</h2>
        <p className="mb-3 text-xs text-slate-500">Soma das linhas do detalhamento dos pedidos com bruto guardado. Negativo = saiu do repasse.</p>
        {meses.length === 0 ? <p className="text-slate-400">Sem dados no período.</p> : (
          <table className="w-full text-xs">
            <thead className="text-left text-slate-500">
              <tr><th className="py-1">Linha</th>{meses.map((mes) => <th key={mes} className="text-right">{mesLabel(mes)}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              <tr className="text-slate-400"><td className="py-1">Pedidos detalhados</td>{meses.map((mes) => <td key={mes} className="text-right">{int(pedidosMes.get(mes) || 0)}</td>)}</tr>
              {CATS_PEDIDO.map((cat) => (
                <tr key={cat.k} className={cat.k === "repasse" ? "bg-slate-800 font-bold" : ""}>
                  <td className="py-1">{cat.r}</td>
                  {meses.map((mes) => { const v = ped.get(mes)?.get(cat.k) || 0; return <td key={mes} className={`text-right ${v < 0 ? "text-red-300" : ""}`}>{v === 0 ? "—" : brl(v)}</td>; })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Visão mensal — Camada 2 */}
      <section className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900 p-6">
        <h2 className="text-xl font-bold">Carteira, mês a mês (data da transação)</h2>
        <p className="mb-3 text-xs text-slate-500">Só o que é custo ou receita fora do pedido: Ads, taxa do Acelera, devoluções após repasse, estornos, ajustes, compensações. Repasses, saques e empréstimo ficam de fora.</p>
        {catsCart.size === 0 ? <p className="text-slate-400">Sem transações no período.</p> : (
          <table className="w-full text-xs">
            <thead className="text-left text-slate-500">
              <tr><th className="py-1">Categoria</th>{meses.map((mes) => <th key={mes} className="text-right">{mesLabel(mes)}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {Array.from(catsCart.entries()).sort((x, y) => x[1].localeCompare(y[1])).map(([cat, rot]) => (
                <tr key={cat} className={cat === "desconhecido" ? "text-orange-300" : ""}>
                  <td className="py-1">{rot}</td>
                  {meses.map((mes) => { const v = cartMes.get(mes)?.get(cat)?.v || 0; return <td key={mes} className={`text-right ${v < 0 ? "text-red-300" : v > 0 ? "text-emerald-300" : ""}`}>{v === 0 ? "—" : brl(v)}</td>; })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
