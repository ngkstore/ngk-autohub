import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { escopoDoUsuario, filtroLojas } from "@/lib/conta";

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
  const periodo = getPeriodo(params.periodo);
  const escopo = await escopoDoUsuario();
  const lojas = filtroLojas(escopo, params.loja);

  const { data: resumoRpc } = await supabase.rpc("auditoria_resumo", {
    p_loja_ids: lojas,
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
  if (lojas) q = q.in("loja_id", lojas);
  if (periodo) {
    q = q.gte("data_pagamento", periodo.inicio).lt("data_pagamento", periodo.fim);
  }
  const { data: divergentes } = await q;

  return (
    <div className="mx-auto max-w-[1400px] p-6">
      <h1 className="text-[22px] font-bold tracking-[-0.01em] text-texto">Auditoria Financeira</h1>
      <p className="mt-0.5 text-[13px] text-texto-2">
        Compara a taxa que a Shopee <strong>deveria</strong> cobrar (regra de
        comissão) com o que ela <strong>realmente cobrou</strong> (escrow).
      </p>

      {!r && (
        <div className="mt-4 rounded-xl bg-chip-amarelo-fundo px-4 py-3 text-sm text-alerta">
          Rode <code>supabase/auditoria_taxas.sql</code> no Supabase para ativar a auditoria.
        </div>
      )}

      {r && (
        <>
          <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-[14px] border border-borda bg-superficie p-6 shadow-cartao">
              <p className="text-sm text-texto-2">Pedidos auditados</p>
              <p className="mt-2 text-4xl font-bold">{r.pedidos}</p>
            </div>
            <div className="rounded-2xl border border-chip-vermelho-fundo bg-superficie p-6">
              <p className="text-sm text-texto-2">Pedidos com divergência</p>
              <p className="mt-2 text-4xl font-bold text-perigo">{r.divergentes}</p>
            </div>
            <div className="rounded-2xl border border-chip-vermelho-fundo bg-superficie p-6">
              <p className="text-sm text-texto-2">Cobrado A MAIS</p>
              <p className="mt-2 text-3xl font-bold text-perigo">
                {moeda(n(r.cobrado_a_mais))}
              </p>
              <p className="mt-1 text-xs text-texto-2">taxa acima do esperado</p>
            </div>
            <div className="rounded-[14px] border border-borda bg-superficie p-6 shadow-cartao">
              <p className="text-sm text-texto-2">Diferença total (líquida)</p>
              <p
                className={`mt-2 text-3xl font-bold ${
                  n(r.diferenca_total) > 0 ? "text-perigo" : "text-sucesso"
                }`}
              >
                {moeda(n(r.diferenca_total))}
              </p>
              <p className="mt-1 text-xs text-texto-2">
                esperado {moeda(n(r.taxa_esperada_total))} • real{" "}
                {moeda(n(r.taxa_real_total))}
              </p>
            </div>
          </div>

          <section className="mt-6 rounded-[14px] border border-borda bg-superficie p-6 shadow-cartao">
            <h2 className="text-[15px] font-semibold text-texto">Pedidos com cobrança divergente
            </h2>
            <p className="mt-1 text-sm text-texto-2">
              Diferença positiva (vermelha) = Shopee cobrou mais do que a regra.
            </p>

            <div className="mt-6 overflow-x-auto rounded-xl border border-borda">
              <table className="w-full text-left">
                <thead className="bg-superficie-2 text-xs font-semibold text-texto-2">
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
                      <tr key={`${p.pedido_externo_id}-${i}`} className="border-t border-borda">
                        <td className="p-4 font-semibold">
                          <Link
                            href={`/auditoria/pedido?order_sn=${p.pedido_externo_id}`}
                            className="text-chip-ceu-texto underline hover:text-primaria"
                          >
                            {p.pedido_externo_id}
                          </Link>
                        </td>
                        <td className="p-4 text-sucesso">{moeda(n(p.valor_total))}</td>
                        <td className="p-4 text-texto">{moeda(n(p.taxa_esperada))}</td>
                        <td className="p-4 text-texto">{moeda(n(p.taxa_real))}</td>
                        <td
                          className={`p-4 font-bold ${
                            n(p.taxa_diferenca) > 0 ? "text-perigo" : "text-sucesso"
                          }`}
                        >
                          {n(p.taxa_diferenca) > 0 ? "+" : ""}
                          {moeda(n(p.taxa_diferenca))}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td className="p-4 text-texto-2" colSpan={5}>
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
