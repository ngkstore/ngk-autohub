import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type AuditoriaPageProps = {
  searchParams: Promise<{ loja?: string; periodo?: string }>;
};

type Resumo = {
  pedidos: number;
  divergentes: number;
  taxa_esperada_total: number;
  taxa_real_total: number;
  diferenca_total: number;
  cobrado_a_mais: number;
  cobrado_a_menos: number;
};

const mapaLojas: Record<string, string> = {
  "ngk-shopee": "NGK Shopee",
  "pitibiribas-shopee": "Pitibiribas Shopee",
  "ngk-tiktok": "NGK TikTok",
  "pitibiribas-tiktok": "Pitibiribas TikTok",
};

function diaBRT(date: Date) {
  return date.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}
function isoBRT(ano: number, mes: number, dia: number) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${ano}-${p(mes)}-${p(dia)}T00:00:00-03:00`;
}
function getPeriodo(periodo?: string): { inicio: string; fim: string } | null {
  const [ano, mes, dia] = diaBRT(new Date()).split("-").map(Number);
  const base = new Date(Date.UTC(ano, mes - 1, dia));
  const isoDe = (d: Date) => isoBRT(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  const deslocar = (n: number) => {
    const d = new Date(base);
    d.setUTCDate(d.getUTCDate() + n);
    return isoDe(d);
  };
  const hoje = isoBRT(ano, mes, dia);
  const amanha = deslocar(1);
  switch (periodo) {
    case "hoje": return { inicio: hoje, fim: amanha };
    case "ontem": return { inicio: deslocar(-1), fim: hoje };
    case "7dias": return { inicio: deslocar(-7), fim: amanha };
    case "30dias": return { inicio: deslocar(-30), fim: amanha };
    case "mes": return { inicio: isoBRT(ano, mes, 1), fim: amanha };
    case "ano": return { inicio: isoBRT(ano, 1, 1), fim: amanha };
    default: return null;
  }
}
function n(v: number | string | null) {
  return Number(v || 0);
}
function moeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default async function AuditoriaPage({ searchParams }: AuditoriaPageProps) {
  const params = await searchParams;
  const apelido = params.loja ? mapaLojas[params.loja] : null;
  const periodo = getPeriodo(params.periodo);

  let lojaId: string | null = null;
  if (apelido) {
    const { data: loja } = await supabase.from("lojas").select("id").eq("apelido", apelido).single();
    lojaId = loja?.id || null;
  }

  const { data: resumoRpc } = await supabase.rpc("auditoria_resumo", {
    p_loja_id: lojaId,
    p_inicio: periodo?.inicio ?? null,
    p_fim: periodo?.fim ?? null,
  });
  const r = (resumoRpc as Resumo | null) || null;

  // Pedidos divergentes (taxa real diferente da esperada).
  let q = supabase
    .from("pedidos_auditoria")
    .select(
      "pedido_externo_id, cliente_nome, valor_total, taxa_esperada, taxa_real, taxa_diferenca, data_pagamento"
    )
    .or("taxa_diferenca.gt.0.5,taxa_diferenca.lt.-0.5")
    .order("taxa_diferenca", { ascending: false })
    .limit(100);
  if (lojaId) q = q.eq("loja_id", lojaId);
  if (periodo) {
    q = q.gte("data_pagamento", periodo.inicio).lt("data_pagamento", periodo.fim);
  }
  const { data: divergentes } = await q;

  return (
    <div className="p-8 text-white">
      <h1 className="text-4xl font-bold">Auditoria Financeira</h1>
      <p className="mt-2 text-slate-400">
        Compara a taxa que a Shopee <strong>deveria</strong> cobrar (regra de
        comissão) com o que ela <strong>realmente cobrou</strong> (escrow).
      </p>

      {!r && (
        <div className="mt-4 rounded-xl bg-yellow-900/40 px-4 py-3 text-sm text-yellow-200">
          Rode <code>supabase/auditoria_taxas.sql</code> no Supabase para ativar a auditoria.
        </div>
      )}

      {r && (
        <>
          <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl bg-slate-900 p-6">
              <p className="text-sm text-slate-400">Pedidos auditados</p>
              <p className="mt-2 text-4xl font-bold">{r.pedidos}</p>
            </div>
            <div className="rounded-2xl border border-red-700 bg-slate-900 p-6">
              <p className="text-sm text-slate-400">Pedidos com divergência</p>
              <p className="mt-2 text-4xl font-bold text-red-300">{r.divergentes}</p>
            </div>
            <div className="rounded-2xl border border-red-700 bg-slate-900 p-6">
              <p className="text-sm text-slate-400">Cobrado A MAIS</p>
              <p className="mt-2 text-3xl font-bold text-red-300">
                {moeda(n(r.cobrado_a_mais))}
              </p>
              <p className="mt-1 text-xs text-slate-500">taxa acima do esperado</p>
            </div>
            <div className="rounded-2xl bg-slate-900 p-6">
              <p className="text-sm text-slate-400">Diferença total (líquida)</p>
              <p
                className={`mt-2 text-3xl font-bold ${
                  n(r.diferenca_total) > 0 ? "text-red-300" : "text-emerald-300"
                }`}
              >
                {moeda(n(r.diferenca_total))}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                esperado {moeda(n(r.taxa_esperada_total))} • real{" "}
                {moeda(n(r.taxa_real_total))}
              </p>
            </div>
          </div>

          <section className="mt-10 rounded-2xl bg-slate-900 p-6">
            <h2 className="text-2xl font-bold">
              Pedidos com cobrança divergente
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              Diferença positiva (vermelha) = Shopee cobrou mais do que a regra.
            </p>

            <div className="mt-6 overflow-x-auto rounded-xl border border-slate-800">
              <table className="w-full text-left">
                <thead className="bg-slate-800 text-sm text-slate-300">
                  <tr>
                    <th className="p-4">Pedido</th>
                    <th className="p-4">Venda</th>
                    <th className="p-4">Taxa esperada</th>
                    <th className="p-4">Taxa cobrada</th>
                    <th className="p-4">Diferença</th>
                  </tr>
                </thead>
                <tbody>
                  {divergentes && divergentes.length > 0 ? (
                    divergentes.map((p, i) => (
                      <tr key={`${p.pedido_externo_id}-${i}`} className="border-t border-slate-800">
                        <td className="p-4 font-semibold">{p.pedido_externo_id}</td>
                        <td className="p-4 text-green-300">{moeda(n(p.valor_total))}</td>
                        <td className="p-4 text-slate-300">{moeda(n(p.taxa_esperada))}</td>
                        <td className="p-4 text-slate-300">{moeda(n(p.taxa_real))}</td>
                        <td
                          className={`p-4 font-bold ${
                            n(p.taxa_diferenca) > 0 ? "text-red-300" : "text-emerald-300"
                          }`}
                        >
                          {n(p.taxa_diferenca) > 0 ? "+" : ""}
                          {moeda(n(p.taxa_diferenca))}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td className="p-4 text-slate-400" colSpan={5}>
                        Nenhuma divergência no período. As taxas batem com a regra. 🎉
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
