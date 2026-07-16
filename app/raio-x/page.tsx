import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { escopoDoUsuario, filtroLojas } from "@/lib/conta";
import {
  lerProductRankings,
  lerVerdict,
  lerTimeGraph,
  diagnosticarPainel,
  medianaDe,
  faixaTicket,
  type ItemPainel,
} from "@/lib/insights/painel";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ loja?: string }> };

function moeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function pct(v: number) {
  return (v * 100).toFixed(2) + "%";
}

// Última captura de um endpoint.
async function ultimaCaptura(
  contem: string,
  admin: boolean,
  contaId: string | null,
  lojas: string[] | null
) {
  let q = supabase
    .from("coletor_capturas")
    .select("payload, capturado_em")
    .ilike("url", `%${contem}%`)
    .order("capturado_em", { ascending: false })
    .limit(1);
  if (!admin) q = q.in("conta_id", contaId ? [contaId] : []);
  if (lojas) q = q.in("loja_id", lojas);
  const { data } = await q;
  return data?.[0] ?? null;
}

export default async function RaioXPage({ searchParams }: Props) {
  const params = await searchParams;
  const escopo = await escopoDoUsuario();
  const lojas = filtroLojas(escopo, params.loja);

  const [capRanking, capVerdict, capTempo] = await Promise.all([
    ultimaCaptura("dashboard/product-rankings", escopo.admin, escopo.contaId, lojas),
    ultimaCaptura("diagnosis/homepage_batch_list_verdict", escopo.admin, escopo.contaId, lojas),
    ultimaCaptura("report/get_time_graph", escopo.admin, escopo.contaId, lojas),
  ]);

  const itens: ItemPainel[] = capRanking ? lerProductRankings(capRanking.payload) : [];
  const vereditosShopee = capVerdict ? lerVerdict(capVerdict.payload) : [];
  const serie = capTempo ? lerTimeGraph(capTempo.payload) : [];

  // Posição média e CPC (da conta) — o que o concorrente cobra pra mostrar.
  const pontos = serie.filter((p) => p.avgRank > 0);
  const rankMedio =
    pontos.length > 0
      ? pontos.reduce((s, p) => s + p.avgRank, 0) / pontos.length
      : 0;
  const cpcs = serie.filter((p) => p.cpc > 0);
  const cpcMedio =
    cpcs.length > 0 ? cpcs.reduce((s, p) => s + p.cpc, 0) / cpcs.length : 0;
  const custoTotal = serie.reduce((s, p) => s + p.custo, 0);

  // Campanhas que a Shopee sugere mudar o ROAS alvo.
  const sugestoes = vereditosShopee.filter(
    (v) => v.roasSugerido != null && v.roasAtual != null
  );
  const problemas = vereditosShopee.filter((v) => v.resultado === "poor");

  // Medianas por faixa de ticket.
  const porFaixa = new Map<string, ItemPainel[]>();
  itens.forEach((i) => {
    const f = faixaTicket(i.ticket);
    porFaixa.set(f, [...(porFaixa.get(f) || []), i]);
  });
  const medianas = new Map<string, { ctr: number; carrinho: number }>();
  porFaixa.forEach((lista, faixa) => {
    medianas.set(faixa, {
      ctr: medianaDe(lista.map((i) => i.ctr)),
      carrinho: medianaDe(lista.map((i) => i.taxaCarrinho)),
    });
  });

  const avaliados = itens
    .map((i) => {
      const m = medianas.get(faixaTicket(i.ticket)) || { ctr: 0, carrinho: 0 };
      return { i, v: diagnosticarPainel(i, m.ctr, m.carrinho) };
    })
    .sort((a, b) => b.i.vendasPagas - a.i.vendasPagas);

  return (
    <div className="p-8 text-white">
      <h1 className="text-4xl font-bold">🔬 Raio-X do Anúncio</h1>
      <p className="mt-2 text-slate-400">
        Funil por anúncio direto do painel da Shopee (via coletor). Cada anúncio
        é comparado com os <strong>pares do mesmo ticket</strong>.
      </p>

      {itens.length === 0 ? (
        <div className="mt-8 rounded-2xl bg-yellow-900/40 p-6 text-yellow-200">
          <p className="font-semibold">Ainda não capturei o funil por produto.</p>
          <p className="mt-2 text-sm">
            Com a extensão ligada, abra o Seller Center →{" "}
            <strong>Informações Gerenciais</strong> → role até o ranking de
            produtos. O coletor pega sozinho. Depois recarregue esta página.
          </p>
          <p className="mt-2 text-xs">
            (Você também pode importar planilhas em{" "}
            <Link href="/insights" className="underline">Insights</Link>.)
          </p>
        </div>
      ) : (
        <>
          {/* O que o concorrente cobra pra mostrar */}
          <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-4">
            <div className="rounded-2xl border border-purple-800 bg-slate-900 p-6">
              <p className="text-sm text-slate-400">📍 Posição média no leilão</p>
              <p className="mt-2 text-4xl font-bold text-purple-300">
                {rankMedio > 0 ? rankMedio.toFixed(0) + "º" : "-"}
              </p>
              <p className="mt-1 text-xs text-slate-500">menor = mais no topo</p>
            </div>
            <div className="rounded-2xl bg-slate-900 p-6">
              <p className="text-sm text-slate-400">CPC médio</p>
              <p className="mt-2 text-4xl font-bold">
                {cpcMedio > 0 ? moeda(cpcMedio) : "-"}
              </p>
            </div>
            <div className="rounded-2xl bg-slate-900 p-6">
              <p className="text-sm text-slate-400">Investido (janela)</p>
              <p className="mt-2 text-4xl font-bold text-red-300">
                {moeda(custoTotal)}
              </p>
            </div>
            <div className="rounded-2xl bg-slate-900 p-6">
              <p className="text-sm text-slate-400">Campanhas com problema</p>
              <p className="mt-2 text-4xl font-bold text-amber-300">
                {problemas.length}
                <span className="text-lg text-slate-500">
                  /{vereditosShopee.length}
                </span>
              </p>
              <p className="mt-1 text-xs text-slate-500">diagnóstico da Shopee</p>
            </div>
          </div>

          {/* A Shopee sugerindo ROAS alvo */}
          {sugestoes.length > 0 && (
            <div className="mt-6 rounded-2xl border border-cyan-800 bg-slate-900 p-6">
              <h2 className="text-xl font-bold">
                🎯 A própria Shopee sugere mudar o ROAS alvo
              </h2>
              <div className="mt-4 space-y-2">
                {sugestoes.map((s) => (
                  <p key={s.campanhaId} className="text-sm text-slate-300">
                    Campanha <span className="text-slate-500">{s.campanhaId}</span> ·{" "}
                    <span className="text-red-300">{s.problema}</span> · alvo atual{" "}
                    <strong>{s.roasAtual?.toFixed(1)}</strong> → sugerido{" "}
                    <strong className="text-green-300">
                      {s.roasSugerido?.toFixed(1)}
                    </strong>
                  </p>
                ))}
              </div>
            </div>
          )}

          {/* Funil por anúncio */}
          <div className="mt-8 overflow-x-auto rounded-2xl border border-slate-800">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-800 text-slate-300">
                <tr>
                  <th className="p-3">Anúncio</th>
                  <th className="p-3">Veredito</th>
                  <th className="p-3">Vendas</th>
                  <th className="p-3">Impressões</th>
                  <th className="p-3">CTR</th>
                  <th className="p-3">🛒 Carrinho</th>
                  <th className="p-3">Conv.</th>
                  <th className="p-3">Rejeição</th>
                  <th className="p-3">Ticket</th>
                </tr>
              </thead>
              <tbody>
                {avaliados.map(({ i, v }) => (
                  <tr key={i.itemId} className="border-t border-slate-800 align-top">
                    <td className="max-w-md p-3">
                      <p className="font-semibold">{i.nome.slice(0, 65)}</p>
                      <p className="mt-1 text-xs text-slate-500">{v.motivo}</p>
                    </td>
                    <td className="p-3">
                      <span className={`whitespace-nowrap rounded-full px-2 py-1 text-xs font-semibold ${v.cor}`}>
                        {v.acao}
                      </span>
                    </td>
                    <td className="p-3 text-green-300">{moeda(i.vendasPagas)}</td>
                    <td className="p-3 text-slate-400">
                      {i.impressoes.toLocaleString("pt-BR")}
                    </td>
                    <td className="p-3">{pct(i.ctr)}</td>
                    <td className="p-3 font-semibold text-cyan-300">
                      {pct(i.taxaCarrinho)}
                    </td>
                    <td className="p-3">{pct(i.taxaConversao)}</td>
                    <td className="p-3 text-slate-400">{pct(i.bounce)}</td>
                    <td className="p-3 text-slate-400">{moeda(i.ticket)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-4 text-xs text-slate-500">
            <strong>Como leio:</strong> CTR baixo = aparece mas não clicam →
            vitrine (capa/título/preço). Carrinho baixo = clicam e não adicionam →
            página (fotos/descrição/avaliações). Muito visitante e zero venda =
            pausar. · Dados do painel, capturados em{" "}
            {capRanking?.capturado_em
              ? new Date(capRanking.capturado_em).toLocaleString("pt-BR")
              : "-"}
            {itens.length <= 5 && (
              <>
                {" "}· <strong className="text-amber-400">
                  Só {itens.length} produtos: aumente o tamanho da página no
                  ranking do painel pra capturar mais.
                </strong>
              </>
            )}
          </p>
        </>
      )}
    </div>
  );
}
