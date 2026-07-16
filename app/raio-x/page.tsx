import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { escopoDoUsuario, filtroLojas } from "@/lib/conta";
import {
  lerAds,
  tipoDaPlanilha,
  faixaTicket,
  mediana,
  diagnosticar,
  type AnuncioAds,
} from "@/lib/insights/planilhas";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ loja?: string }> };

function moeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default async function RaioXPage({ searchParams }: Props) {
  const params = await searchParams;
  const escopo = await escopoDoUsuario();
  const lojas = filtroLojas(escopo, params.loja);

  // Última importação do relatório de Ads.
  let q = supabase
    .from("insights_importacoes")
    .select("id, arquivo, colunas, linhas, periodo_inicio, periodo_fim, importado_em")
    .order("importado_em", { ascending: false })
    .limit(20);
  if (!escopo.admin) q = q.in("conta_id", escopo.contaId ? [escopo.contaId] : []);
  if (lojas) q = q.in("loja_id", lojas);
  const { data: imports } = await q;

  const importAds = (imports || []).find(
    (i) => tipoDaPlanilha(i.colunas) === "ads"
  );

  const anuncios: AnuncioAds[] = importAds?.linhas
    ? lerAds(importAds.linhas as Record<string, unknown>[])
    : [];

  // Medianas por faixa de ticket (comparar igual com igual).
  const porFaixa = new Map<string, AnuncioAds[]>();
  anuncios.forEach((a) => {
    const f = faixaTicket(a.ticket);
    porFaixa.set(f, [...(porFaixa.get(f) || []), a]);
  });
  const medianas = new Map<string, { ctr: number; carrinho: number }>();
  porFaixa.forEach((lista, faixa) => {
    medianas.set(faixa, {
      ctr: mediana(lista.map((a) => a.ctr)),
      carrinho: mediana(lista.map((a) => a.taxaCarrinho)),
    });
  });

  const avaliados = anuncios
    .map((a) => {
      const m = medianas.get(faixaTicket(a.ticket)) || { ctr: 0, carrinho: 0 };
      return { a, v: diagnosticar(a, m.ctr, m.carrinho) };
    })
    .sort((x, y) => y.a.despesas - x.a.despesas);

  const desperdicio = avaliados
    .filter((x) => x.v.acao === "PAUSAR")
    .reduce((s, x) => s + x.a.despesas, 0);
  const gastoTotal = anuncios.reduce((s, a) => s + a.despesas, 0);
  const gmvTotal = anuncios.reduce((s, a) => s + a.gmv, 0);

  return (
    <div className="p-8 text-white">
      <h1 className="text-4xl font-bold">🔬 Raio-X do Anúncio</h1>
      <p className="mt-2 text-slate-400">
        Diagnóstico por anúncio: onde o funil vaza e o que fazer. Compara cada
        anúncio com os <strong>pares do mesmo ticket</strong> (comparar uma
        balança de R$17 com uma panela de R$300 seria injusto).
      </p>

      {!importAds ? (
        <div className="mt-8 rounded-2xl bg-yellow-900/40 p-6 text-yellow-200">
          <p className="font-semibold">Nenhum relatório de Ads importado ainda.</p>
          <p className="mt-2 text-sm">
            Exporte o <strong>Dados Gerais de Anúncios</strong> no Shopee Ads e
            suba em <Link href="/insights" className="underline">Insights (planilhas)</Link>.
            Se você já subiu e caiu aqui, a planilha veio com o cabeçalho errado —
            suba de novo (o leitor foi corrigido).
          </p>
        </div>
      ) : (
        <>
          <p className="mt-2 text-xs text-slate-500">
            Fonte: {importAds.arquivo} • período {importAds.periodo_inicio || "?"} a{" "}
            {importAds.periodo_fim || "?"} • {anuncios.length} anúncios
          </p>

          <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-3">
            <div className="rounded-2xl border border-red-800 bg-slate-900 p-6">
              <p className="text-sm text-slate-400">💸 Desperdício (gasto sem venda)</p>
              <p className="mt-2 text-4xl font-bold text-red-300">
                {moeda(desperdicio)}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                no período • ~{moeda(desperdicio * 30)}/mês se repetir todo dia
              </p>
            </div>
            <div className="rounded-2xl bg-slate-900 p-6">
              <p className="text-sm text-slate-400">Investimento total</p>
              <p className="mt-2 text-4xl font-bold">{moeda(gastoTotal)}</p>
            </div>
            <div className="rounded-2xl bg-slate-900 p-6">
              <p className="text-sm text-slate-400">GMV via Ads</p>
              <p className="mt-2 text-4xl font-bold text-green-300">
                {moeda(gmvTotal)}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                ROAS geral {gastoTotal > 0 ? (gmvTotal / gastoTotal).toFixed(1) : "-"}
              </p>
            </div>
          </div>

          <div className="mt-8 overflow-x-auto rounded-2xl border border-slate-800">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-800 text-slate-300">
                <tr>
                  <th className="p-3">Anúncio</th>
                  <th className="p-3">Veredito</th>
                  <th className="p-3">Gasto</th>
                  <th className="p-3">GMV</th>
                  <th className="p-3">ROAS</th>
                  <th className="p-3">Ticket</th>
                  <th className="p-3">CTR</th>
                  <th className="p-3">Carrinho</th>
                  <th className="p-3">Conv.</th>
                </tr>
              </thead>
              <tbody>
                {avaliados.map(({ a, v }) => (
                  <tr key={a.itemId} className="border-t border-slate-800 align-top">
                    <td className="max-w-md p-3">
                      <p className="font-semibold">{a.nome.slice(0, 70)}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {v.motivo}
                      </p>
                    </td>
                    <td className="p-3">
                      <span className={`whitespace-nowrap rounded-full px-2 py-1 text-xs font-semibold ${v.cor}`}>
                        {v.acao}
                      </span>
                    </td>
                    <td className="p-3 text-red-300">{moeda(a.despesas)}</td>
                    <td className="p-3 text-green-300">{moeda(a.gmv)}</td>
                    <td className="p-3 font-semibold">{a.roas.toFixed(1)}</td>
                    <td className="p-3 text-slate-400">{moeda(a.ticket)}</td>
                    <td className="p-3">{a.ctr.toFixed(2)}%</td>
                    <td className="p-3">{a.taxaCarrinho.toFixed(2)}%</td>
                    <td className="p-3">{a.taxaConversao.toFixed(2)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-4 text-xs text-slate-500">
            <strong>Como leio:</strong> CTR baixo = tem impressão mas não clicam →
            vitrine (capa/título/preço). Carrinho baixo = clicam e não adicionam →
            página (fotos/descrição/avaliações). Gasto sem venda = pausar.
          </p>
        </>
      )}
    </div>
  );
}
