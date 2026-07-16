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
import { lerVerdict, lerTimeGraph, periodoDaUrl } from "@/lib/insights/painel";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ loja?: string }> };

function moeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Última captura do coletor p/ um endpoint (aceita capturas antigas sem loja).
async function ultimaCaptura(contem: string, admin: boolean, contaId: string | null) {
  let q = supabase
    .from("coletor_capturas")
    .select("url, payload, capturado_em")
    .ilike("url", `%${contem}%`)
    .order("capturado_em", { ascending: false })
    .limit(1);
  if (!admin) {
    q = q.or(
      `conta_id.eq.${contaId ?? "00000000-0000-0000-0000-000000000000"},conta_id.is.null`
    );
  }
  const { data } = await q;
  return data?.[0] ?? null;
}

// Quais janelas (hoje / 7 / 15 / 30 dias) o coletor já capturou.
async function janelasCapturadas(admin: boolean, contaId: string | null) {
  let q = supabase
    .from("coletor_capturas")
    .select("url")
    .ilike("url", "%dashboard/product-rankings%")
    .order("capturado_em", { ascending: false })
    .limit(50);
  if (!admin) {
    q = q.or(
      `conta_id.eq.${contaId ?? "00000000-0000-0000-0000-000000000000"},conta_id.is.null`
    );
  }
  const { data } = await q;
  const rotulos = new Set<string>();
  (data || []).forEach((c) => rotulos.add(periodoDaUrl(String(c.url)).rotulo));
  return Array.from(rotulos);
}

export default async function RaioXPage({ searchParams }: Props) {
  const params = await searchParams;
  const escopo = await escopoDoUsuario();
  const lojas = filtroLojas(escopo, params.loja);

  /* ---------- 1) Funil + gasto por anúncio: vem da planilha de Ads ---------- */
  let q = supabase
    .from("insights_importacoes")
    .select("id, arquivo, colunas, linhas, periodo_inicio, periodo_fim")
    .order("importado_em", { ascending: false })
    .limit(20);
  if (!escopo.admin) q = q.in("conta_id", escopo.contaId ? [escopo.contaId] : []);
  if (lojas) q = q.in("loja_id", lojas);
  const { data: imports } = await q;

  const candidatos = (imports || []).filter((i) => tipoDaPlanilha(i.colunas) === "ads");
  let importAds: (typeof candidatos)[number] | null = null;
  let anuncios: AnuncioAds[] = [];
  for (const c of candidatos) {
    const lidos = lerAds((c.linhas || []) as Record<string, unknown>[]);
    if (lidos.length > anuncios.length) {
      anuncios = lidos;
      importAds = c;
    }
  }

  /* ---------- 2) Extras do painel (coletor): posição, CPC, sugestão -------- */
  const [capVerdict, capTempo, janelas] = await Promise.all([
    ultimaCaptura("diagnosis/homepage_batch_list_verdict", escopo.admin, escopo.contaId),
    ultimaCaptura("report/get_time_graph", escopo.admin, escopo.contaId),
    janelasCapturadas(escopo.admin, escopo.contaId),
  ]);
  const vereditosShopee = capVerdict ? lerVerdict(capVerdict.payload) : [];
  const serie = capTempo ? lerTimeGraph(capTempo.payload) : [];

  const comRank = serie.filter((p) => p.avgRank > 0);
  const rankMedio = comRank.length
    ? comRank.reduce((s, p) => s + p.avgRank, 0) / comRank.length
    : 0;
  const comCpc = serie.filter((p) => p.cpc > 0);
  const cpcMedio = comCpc.length
    ? comCpc.reduce((s, p) => s + p.cpc, 0) / comCpc.length
    : 0;
  const sugestoes = vereditosShopee.filter((v) => v.roasSugerido != null);

  /* ---------- 3) Diagnóstico (mediana dos pares do mesmo ticket) ----------- */
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
        anúncio com os <strong>pares do mesmo ticket</strong>.
      </p>

      {/* Escada 7/15/30: quais janelas o coletor já pegou */}
      <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <p className="text-sm text-slate-300">
          📅 <strong>Janelas capturadas pelo coletor:</strong>{" "}
          {janelas.length > 0 ? (
            janelas.map((j) => (
              <span
                key={j}
                className="mr-2 rounded-full bg-slate-700 px-3 py-1 text-xs text-slate-200"
              >
                {j}
              </span>
            ))
          ) : (
            <span className="text-slate-500">nenhuma ainda</span>
          )}
        </p>
        <p className="mt-2 text-xs text-slate-500">
          O coletor guarda <strong>o período que você está vendo no painel</strong>.
          Para montar a escada 7/15/30: abra <strong>Informações Gerenciais →
          ranking de produtos</strong> e troque o período (7 dias → 15 → 30),
          esperando carregar. Cada troca vira uma janela aqui.
        </p>
      </div>

      {/* Extras que vêm do coletor (o painel) */}
      {(rankMedio > 0 || sugestoes.length > 0) && (
        <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-3">
          <div className="rounded-2xl border border-purple-800 bg-slate-900 p-6">
            <p className="text-sm text-slate-400">📍 Posição média no leilão</p>
            <p className="mt-2 text-4xl font-bold text-purple-300">
              {rankMedio > 0 ? rankMedio.toFixed(0) + "º" : "-"}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              menor = mais no topo · via coletor
            </p>
          </div>
          <div className="rounded-2xl bg-slate-900 p-6">
            <p className="text-sm text-slate-400">CPC médio</p>
            <p className="mt-2 text-4xl font-bold">
              {cpcMedio > 0 ? moeda(cpcMedio) : "-"}
            </p>
          </div>
          <div className="rounded-2xl bg-slate-900 p-6">
            <p className="text-sm text-slate-400">Diagnóstico da Shopee</p>
            <p className="mt-2 text-4xl font-bold text-amber-300">
              {vereditosShopee.filter((v) => v.resultado === "poor").length}
              <span className="text-lg text-slate-500">
                /{vereditosShopee.length}
              </span>
            </p>
            <p className="mt-1 text-xs text-slate-500">campanhas com problema</p>
          </div>
        </div>
      )}

      {sugestoes.length > 0 && (
        <div className="mt-6 rounded-2xl border border-cyan-800 bg-slate-900 p-6">
          <h2 className="text-xl font-bold">
            🎯 A própria Shopee sugere mudar o ROAS alvo
          </h2>
          <div className="mt-3 space-y-1">
            {sugestoes.map((s) => (
              <p key={s.campanhaId} className="text-sm text-slate-300">
                Campanha <span className="text-slate-500">{s.campanhaId}</span> ·{" "}
                <span className="text-red-300">{s.problema}</span> · alvo{" "}
                <strong>{s.roasAtual?.toFixed(1)}</strong> → sugerido{" "}
                <strong className="text-green-300">{s.roasSugerido?.toFixed(1)}</strong>
              </p>
            ))}
          </div>
        </div>
      )}

      {!importAds ? (
        <div className="mt-8 rounded-2xl bg-yellow-900/40 p-6 text-yellow-200">
          <p className="font-semibold">Nenhum relatório de Ads importado.</p>
          <p className="mt-2 text-sm">
            Exporte <strong>Dados Gerais de Anúncios</strong> no Shopee Ads e suba
            em <Link href="/insights" className="underline">Insights</Link>.
          </p>
        </div>
      ) : (
        <>
          <p className="mt-6 text-xs text-slate-500">
            Fonte: {importAds.arquivo} • {importAds.periodo_inicio || "?"} a{" "}
            {importAds.periodo_fim || "?"} • {anuncios.length} anúncios
          </p>

          <div className="mt-4 grid grid-cols-1 gap-6 md:grid-cols-3">
            <div className="rounded-2xl border border-red-800 bg-slate-900 p-6">
              <p className="text-sm text-slate-400">💸 Desperdício (gasto sem venda)</p>
              <p className="mt-2 text-4xl font-bold text-red-300">{moeda(desperdicio)}</p>
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
              <p className="mt-2 text-4xl font-bold text-green-300">{moeda(gmvTotal)}</p>
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
                  <th className="p-3">🛒 Carrinho</th>
                  <th className="p-3">Conv.</th>
                </tr>
              </thead>
              <tbody>
                {avaliados.map(({ a, v }) => (
                  <tr key={a.itemId} className="border-t border-slate-800 align-top">
                    <td className="max-w-md p-3">
                      <p className="font-semibold">{a.nome.slice(0, 65)}</p>
                      <p className="mt-1 text-xs text-slate-500">{v.motivo}</p>
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
                    <td className="p-3 font-semibold text-cyan-300">
                      {a.taxaCarrinho.toFixed(2)}%
                    </td>
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
