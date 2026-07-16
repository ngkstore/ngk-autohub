import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { escopoDoUsuario } from "@/lib/conta";
import {
  lerAds,
  tipoDaPlanilha,
  type AnuncioAds,
} from "@/lib/insights/planilhas";
import {
  lerProductRankings,
  lerVerdict,
  lerTimeGraph,
  periodoDaUrl,
  diagnosticarPainel,
  medianaDe,
  faixaTicket,
  type ItemPainel,
} from "@/lib/insights/painel";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ loja?: string; janela?: string }> };

function moeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function pct(v: number) {
  return (v * 100).toFixed(2) + "%";
}

async function capturas(contem: string, admin: boolean, contaId: string | null) {
  let q = supabase
    .from("coletor_capturas")
    .select("url, payload, capturado_em")
    .ilike("url", `%${contem}%`)
    .order("capturado_em", { ascending: false })
    .limit(60);
  if (!admin) {
    q = q.or(
      `conta_id.eq.${contaId ?? "00000000-0000-0000-0000-000000000000"},conta_id.is.null`
    );
  }
  const { data } = await q;
  return data || [];
}

export default async function RaioXPage({ searchParams }: Props) {
  const params = await searchParams;
  const escopo = await escopoDoUsuario();

  /* ---------------- Coletor: funil por produto, por janela ---------------- */
  const capsRanking = await capturas(
    "dashboard/product-rankings",
    escopo.admin,
    escopo.contaId
  );

  // Melhor captura por janela (a mais recente de cada período).
  const porJanela = new Map<string, { itens: ItemPainel[]; dias: number; quando: string }>();
  for (const c of capsRanking) {
    const p = periodoDaUrl(String(c.url));
    const itens = lerProductRankings(c.payload);
    if (itens.length === 0) continue;
    const atual = porJanela.get(p.rotulo);
    if (!atual || itens.length > atual.itens.length) {
      porJanela.set(p.rotulo, {
        itens,
        dias: p.dias,
        quando: String(c.capturado_em),
      });
    }
  }

  const janelasDisponiveis = Array.from(porJanela.entries()).sort(
    (a, b) => a[1].dias - b[1].dias
  );
  // Janela pedida na URL, ou a maior disponível.
  const janelaEscolhida =
    (params.janela && porJanela.has(params.janela) ? params.janela : null) ||
    janelasDisponiveis[janelasDisponiveis.length - 1]?.[0] ||
    null;
  const dadosJanela = janelaEscolhida ? porJanela.get(janelaEscolhida)! : null;
  const itens = dadosJanela?.itens || [];

  /* ------------- Coletor: posição, CPC e sugestão de ROAS ---------------- */
  const [capsVerdict, capsTempo] = await Promise.all([
    capturas("diagnosis/homepage_batch_list_verdict", escopo.admin, escopo.contaId),
    capturas("report/get_time_graph", escopo.admin, escopo.contaId),
  ]);
  const vereditosShopee = capsVerdict[0] ? lerVerdict(capsVerdict[0].payload) : [];
  const serie = capsTempo[0] ? lerTimeGraph(capsTempo[0].payload) : [];
  const comRank = serie.filter((p) => p.avgRank > 0);
  const rankMedio = comRank.length
    ? comRank.reduce((s, p) => s + p.avgRank, 0) / comRank.length
    : 0;
  const comCpc = serie.filter((p) => p.cpc > 0);
  const cpcMedio = comCpc.length
    ? comCpc.reduce((s, p) => s + p.cpc, 0) / comCpc.length
    : 0;
  const sugestoes = vereditosShopee.filter((v) => v.roasSugerido != null);

  /* --------- Planilha de Ads (gasto/ROAS por item) — complementa --------- */
  let qi = supabase
    .from("insights_importacoes")
    .select("arquivo, colunas, linhas, periodo_inicio, periodo_fim")
    .order("importado_em", { ascending: false })
    .limit(20);
  if (!escopo.admin) qi = qi.in("conta_id", escopo.contaId ? [escopo.contaId] : []);
  const { data: imports } = await qi;
  let anunciosAds: AnuncioAds[] = [];
  let importAds: { arquivo: string | null; periodo_inicio: string | null } | null = null;
  for (const c of (imports || []).filter((i) => tipoDaPlanilha(i.colunas) === "ads")) {
    const lidos = lerAds((c.linhas || []) as Record<string, unknown>[]);
    if (lidos.length > anunciosAds.length) {
      anunciosAds = lidos;
      importAds = c;
    }
  }
  const adsPorItem = new Map(anunciosAds.map((a) => [a.itemId, a]));

  /* ------------------------- Diagnóstico ------------------------- */
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
      return { i, v: diagnosticarPainel(i, m.ctr, m.carrinho), ads: adsPorItem.get(i.itemId) };
    })
    .sort((a, b) => b.i.vendasPagas - a.i.vendasPagas);

  const usandoColetor = itens.length > 0;

  return (
    <div className="p-8 text-white">
      <h1 className="text-4xl font-bold">🔬 Raio-X do Anúncio</h1>
      <p className="mt-2 text-slate-400">
        Funil por anúncio, comparado com os <strong>pares do mesmo ticket</strong>.
      </p>

      {/* Seletor de janela (a escada 7/15/30) */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="text-sm text-slate-400">📅 Janela:</span>
        {janelasDisponiveis.length > 0 ? (
          janelasDisponiveis.map(([rotulo, d]) => (
            <Link
              key={rotulo}
              href={`/raio-x?janela=${encodeURIComponent(rotulo)}`}
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                rotulo === janelaEscolhida
                  ? "bg-cyan-600 text-white"
                  : "bg-slate-700 text-slate-300 hover:bg-slate-600"
              }`}
            >
              {rotulo} ({d.itens.length} produtos)
            </Link>
          ))
        ) : (
          <span className="text-xs text-slate-500">
            nenhuma ainda — abra o Seller Center com a extensão ligada
          </span>
        )}
      </div>

      {/* Cards do painel */}
      {(rankMedio > 0 || sugestoes.length > 0) && (
        <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-3">
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
            <p className="text-sm text-slate-400">Diagnóstico da Shopee</p>
            <p className="mt-2 text-4xl font-bold text-amber-300">
              {vereditosShopee.filter((v) => v.resultado === "poor").length}
              <span className="text-lg text-slate-500">/{vereditosShopee.length}</span>
            </p>
            <p className="mt-1 text-xs text-slate-500">campanhas com problema</p>
          </div>
        </div>
      )}

      {sugestoes.length > 0 && (
        <div className="mt-6 rounded-2xl border border-cyan-800 bg-slate-900 p-6">
          <h2 className="text-xl font-bold">🎯 A própria Shopee sugere mudar o ROAS alvo</h2>
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

      {!usandoColetor ? (
        <div className="mt-8 rounded-2xl bg-yellow-900/40 p-6 text-yellow-200">
          <p className="font-semibold">O coletor ainda não trouxe o funil por produto.</p>
          <p className="mt-2 text-sm">
            Com a extensão atualizada, abra o Seller Center →{" "}
            <strong>Informações Gerenciais → ranking de produtos</strong> (período
            30 dias) e espere ~15s. Depois recarregue aqui.
          </p>
          <p className="mt-2 text-xs text-slate-400">
            Capturas de product-rankings encontradas: {capsRanking.length}
            {capsRanking.length > 0 && " (mas nenhuma com produtos legíveis)"}
          </p>
        </div>
      ) : (
        <>
          <p className="mt-6 text-xs text-slate-500">
            Fonte: painel da Shopee (coletor) • janela <strong>{janelaEscolhida}</strong>{" "}
            • {itens.length} produtos • capturado em{" "}
            {new Date(dadosJanela!.quando).toLocaleString("pt-BR")}
            {importAds && ` • gasto/ROAS da planilha ${importAds.periodo_inicio || ""}`}
          </p>

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
                    <td className="p-3 font-semibold text-cyan-300">{pct(i.taxaCarrinho)}</td>
                    <td className="p-3">{pct(i.taxaConversao)}</td>
                    <td className="p-3 text-slate-400">{pct(i.bounce)}</td>
                    <td className="p-3 text-slate-400">{moeda(i.ticket)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <p className="mt-4 text-xs text-slate-500">
        <strong>Como leio:</strong> CTR baixo = aparece mas não clicam → vitrine
        (capa/título/preço). Carrinho baixo = clicam e não adicionam → página
        (fotos/descrição/avaliações). Muito visitante e zero venda = pausar.
      </p>
    </div>
  );
}
