import { escopoDoUsuario, filtroLojas } from "@/lib/conta";
import { supabase } from "@/lib/supabase";
import { brl, numero, pct, data as fmtData, agoraMs } from "@/lib/formato";
import Lancamentos from "./Lancamentos";
import { Card, CardHeader, Kpi, Chip, ChipCanal, Segmentado, Tabela, Th, Tr, Td, Vazio, Barra, Dica } from "../components/ui";

export const dynamic = "force-dynamic";

const dur = (s: number | null) => (s == null ? "—" : s >= 3600 ? `${Math.floor(s / 3600)}h ${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`);
type L = { id: string; canal: "shopee" | "tiktok"; loja_id: string; origem: string; tipo_conta: string | null; criador_nome: string | null; criador_usuario: string | null; inicio: string | null; fim: string | null; duracao_s: number | null; receita: number; pedidos: number; espectadores: number | null; pico: number | null; tempo_medio_s: number | null; ctr: number | null; receita_por_hora: number | null; lojas: { apelido: string } | null };
type AfOrder = { criador_usuario: string | null; conteudo_tipo: string | null; conteudo_id: string | null; base_comissao: number | null; comissao_estimada: number | null; comissao_paga: number | null; criado_em: string | null };

export default async function LivesPage({ searchParams }: { searchParams: Promise<{ loja?: string; canal?: string; periodo?: string }> }) {
  const params = await searchParams;
  const escopo = await escopoDoUsuario();
  const lojas = filtroLojas(escopo, params.loja);
  const canal = params.canal === "tiktok" || params.canal === "shopee" ? params.canal : "todos";
  const dias = params.periodo === "7dias" ? 7 : params.periodo === "hoje" ? 1 : params.periodo === "ano" ? 365 : params.periodo === "todos" ? 3650 : 30;
  const desde = new Date(agoraMs() - dias * 86400000).toISOString();
  const antes = new Date(agoraMs() - 2 * dias * 86400000).toISOString();

  let ql = supabase.from("lives").select("id, canal, loja_id, origem, tipo_conta, criador_nome, criador_usuario, inicio, fim, duracao_s, receita, pedidos, espectadores, pico, tempo_medio_s, ctr, receita_por_hora, lojas(apelido)").gte("inicio", antes).order("inicio", { ascending: false }).limit(3000);
  if (lojas) ql = ql.in("loja_id", lojas);
  if (canal !== "todos") ql = ql.eq("canal", canal);
  const [{ data: livesRaw }, { data: lojasInfo }, { data: spsRaw }, { data: afTikRaw }, { data: afShop }] = await Promise.all([
    ql,
    supabase.from("lojas").select("id, apelido, marketplace").in("id", lojas ?? escopo.lojaIds),
    supabase.from("sps_lancamentos").select("loja_id, dia, sps").order("dia", { ascending: false }).limit(50),
    (() => {
      let q = supabase.from("tiktok_afiliado_pedidos").select("criador_usuario, conteudo_tipo, conteudo_id, base_comissao, comissao_estimada, comissao_paga, criado_em").gte("criado_em", antes).limit(10000);
      if (lojas) q = q.in("loja_id", lojas);
      return q;
    })(),
    (() => {
      let q = supabase.from("afiliados_afiliado_dia").select("affiliate_username, affiliate_name, vendas, pedidos, comissao, data").gte("data", desde.slice(0, 10)).limit(5000);
      if (lojas) q = q.in("loja_id", lojas);
      return q;
    })(),
  ]);
  const todas = ((livesRaw || []) as unknown) as L[];
  const afTik = ((afTikRaw || []) as unknown) as AfOrder[];

  // Lives DA LOJA = conta oficial (tipo_conta OFFICIAL_ACCOUNTS, author_type OFFICIAL) ou lançamento manual.
  // Lives DE CRIADORES = afiliados (AFFILIATE_ACCOUNTS): a receita vem dos pedidos de afiliados (conteúdo LIVE)
  // do criador na janela da live, porque a API de analytics devolve live_attributed_gmv 0 nessas sessões.
  const ehLoja = (l: L) => l.origem === "manual" || l.tipo_conta === "OFFICIAL_ACCOUNTS";
  const noPeriodo = (l: L) => !!l.inicio && l.inicio >= desde;
  const lojaLives = todas.filter(ehLoja);
  const lojaPeriodo = lojaLives.filter(noPeriodo);
  const lojaAnterior = lojaLives.filter((l) => l.inicio && l.inicio < desde);
  const criadores = todas.filter((l) => !ehLoja(l) && noPeriodo(l) && (Number(l.duracao_s || 0) >= 300 || Number(l.receita) > 0));
  const curtasIgnoradas = todas.filter((l) => !ehLoja(l) && noPeriodo(l)).length - criadores.length;

  // receita de criador por live: pedidos de afiliados (LIVE) do mesmo criador entre o início e 2 h após o fim
  const porCriador = new Map<string, AfOrder[]>();
  for (const a of afTik) if (a.conteudo_tipo === "LIVE" && a.criador_usuario) porCriador.set(a.criador_usuario, [...(porCriador.get(a.criador_usuario) || []), a]);
  const receitaLive = (l: L) => {
    const lista = porCriador.get(l.criador_usuario || "") || [];
    const ini = l.inicio ? new Date(l.inicio).getTime() : 0;
    const fim = (l.fim ? new Date(l.fim).getTime() : ini + Number(l.duracao_s || 0) * 1000) + 2 * 3600000;
    const dentro = lista.filter((a) => a.criado_em && new Date(a.criado_em).getTime() >= ini && new Date(a.criado_em).getTime() <= fim);
    return { receita: dentro.reduce((s, a) => s + Number(a.base_comissao || 0), 0), pedidos: dentro.length, comissao: dentro.reduce((s, a) => s + Number(a.comissao_paga ?? a.comissao_estimada ?? 0), 0) };
  };
  const criadoresComReceita = criadores.map((l) => ({ ...l, af: receitaLive(l) }));

  const soma = (xs: L[], f: (l: L) => number) => xs.reduce((s, l) => s + (f(l) || 0), 0);
  const receita = soma(lojaPeriodo, (l) => Number(l.receita));
  const receitaAnt = soma(lojaAnterior, (l) => Number(l.receita));
  const varPct = receitaAnt > 0 ? ((receita - receitaAnt) / receitaAnt) * 100 : null;
  const horas = soma(lojaPeriodo, (l) => Number(l.duracao_s || 0)) / 3600;
  const receitaHora = horas > 0 ? receita / horas : 0;
  const pico = Math.max(0, ...lojaPeriodo.map((l) => Number(l.pico ?? 0)));
  const afiliadoLive = afTik.filter((a) => a.conteudo_tipo === "LIVE" && a.criado_em && a.criado_em >= desde).reduce((s, a) => s + Number(a.base_comissao || 0), 0);
  // receita atribuída pela API de lives (live_attributed_gmv) às lives de criadores no período — é o "Transmissões ao vivo" do Seller Center
  const criadoresApi = soma(criadores.filter(noPeriodo), (l) => Number(l.receita || 0));
  const afiliadoTotal = afTik.filter((a) => a.criado_em && a.criado_em >= desde).reduce((s, a) => s + Number(a.base_comissao || 0), 0);
  const melhor = [...lojaPeriodo].sort((a, b) => Number(b.receita) - Number(a.receita))[0];
  const maxReceita = Math.max(1, ...lojaPeriodo.map((l) => Number(l.receita)));

  // afiliados que mais venderam (TikTok: todos os conteúdos; Shopee: AMS por dia)
  const ranking = new Map<string, { nome: string; conteudo: string; pedidos: number; receita: number; comissao: number; pago: number; pendente: number; canal: "tiktok" | "shopee" }>();
  for (const a of afTik) {
    if (!a.criado_em || a.criado_em < desde) continue;
    const k = `tt|${a.criador_usuario ?? "?"}`;
    const c = ranking.get(k) || { nome: `@${a.criador_usuario ?? "?"}`, conteudo: a.conteudo_tipo ?? "", pedidos: 0, receita: 0, comissao: 0, pago: 0, pendente: 0, canal: "tiktok" };
    c.pedidos++;
    c.receita += Number(a.base_comissao || 0);
    c.comissao += Number(a.comissao_paga ?? a.comissao_estimada ?? 0);
    if (a.comissao_paga != null) c.pago++;
    else c.pendente++;
    ranking.set(k, c);
  }
  if (canal !== "tiktok") {
    for (const a of afShop || []) {
      const k = `sh|${a.affiliate_username ?? a.affiliate_name ?? "?"}`;
      const c = ranking.get(k) || { nome: `@${a.affiliate_username ?? a.affiliate_name ?? "?"}`, conteudo: "AMS", pedidos: 0, receita: 0, comissao: 0, pago: 0, pendente: 0, canal: "shopee" };
      c.pedidos += Number(a.pedidos || 0);
      c.receita += Number(a.vendas || 0);
      c.comissao += Number(a.comissao || 0);
      ranking.set(k, c);
    }
  }
  const topCriadores = [...ranking.values()].filter((c) => canal === "todos" || c.canal === canal).sort((a, b) => b.receita - a.receita).slice(0, 10);
  const lojasTik = (lojasInfo || []).filter((l) => l.marketplace === "tiktok_shop");
  const spsPorLoja = new Map<string, { dia: string; sps: number }>();
  for (const s of spsRaw || []) if (!spsPorLoja.has(s.loja_id)) spsPorLoja.set(s.loja_id, { dia: s.dia, sps: Number(s.sps) });
  const link = (c: string) => `/lives?canal=${c}${params.loja ? `&loja=${params.loja}` : ""}${params.periodo ? `&periodo=${params.periodo}` : ""}`;

  return (
    <div className="mx-auto max-w-[1400px] p-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold tracking-[-0.01em] text-texto">Lives e afiliados</h1>
          <p className="mt-0.5 text-[13px] text-texto-2">TikTok Shop e Shopee · lives da loja, lives de criadores e afiliados · período do topo</p>
        </div>
        <Segmentado rotulo="Canal" ativa={canal} opcoes={[{ id: "todos", nome: "Todos", href: link("todos") }, { id: "tiktok", nome: "TikTok", href: link("tiktok") }, { id: "shopee", nome: "Shopee", href: link("shopee") }]} />
      </div>

      <div className="grid grid-cols-2 gap-3.5 md:grid-cols-5">
        <Kpi icone="lives" cor="indigo" rotulo="Receita das lives da loja" valor={brl(receita, 0)} variacao={varPct ?? undefined} detalhe={`${lojaPeriodo.length} live(s) da conta oficial`} />
        <Kpi icone="painel" cor="ceu" rotulo="Horas ao vivo (loja)" valor={`${numero(horas, 1)} h`} />
        <Kpi icone="financas" cor="verde" rotulo="Receita por hora (loja)" valor={brl(receitaHora, 0)} />
        <Kpi icone="insights" cor="roxo" rotulo="Pico de espectadores (loja)" valor={numero(pico)} detalhe="simultâneos (pcu)" />
        <Kpi icone="ads" cor="laranja" rotulo="Lives de criadores (atribuído)" valor={brl(criadoresApi, 0)} detalhe={`API de lives · pedidos de afiliado via LIVE: ${brl(afiliadoLive, 0)} · afiliados no total: ${brl(afiliadoTotal, 0)}`} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader titulo="Lives da loja" descricao={`conta oficial${melhor ? ` · melhor: ${fmtData(melhor.inicio, true)} · ${brl(melhor.receita, 0)}` : ""}`} />
          {lojaPeriodo.length === 0 ? (
            <Vazio titulo="Nenhuma live da loja no período" texto="As lives da conta oficial do TikTok entram pela API; as da Shopee pelo lançamento abaixo." />
          ) : (
            <Tabela>
              <thead>
                <tr>
                  <Th>Data</Th>
                  <Th>Canal</Th>
                  <Th>Duração</Th>
                  <Th numerica>Receita</Th>
                  <Th numerica>Pedidos</Th>
                  <Th numerica>Espectadores</Th>
                  <Th numerica>Pico</Th>
                  <Th numerica>Tempo médio</Th>
                  <Th numerica>Clique no produto</Th>
                  <Th numerica>Receita/hora</Th>
                </tr>
              </thead>
              <tbody>
                {lojaPeriodo.slice(0, 50).map((l) => (
                  <Tr key={l.id}>
                    <Td>
                      {fmtData(l.inicio, true)}
                      <div className="w-24">
                        <Barra pct={(Number(l.receita) / maxReceita) * 100} />
                      </div>
                    </Td>
                    <Td>
                      <ChipCanal canal={l.canal} />
                    </Td>
                    <Td>{l.duracao_s ? dur(l.duracao_s) : l.fim ? "—" : "sem fim informado"}</Td>
                    <Td numerica className="font-semibold">{brl(l.receita, 0)}</Td>
                    <Td numerica>{numero(l.pedidos)}</Td>
                    <Td numerica>{l.espectadores == null ? "—" : numero(l.espectadores)}</Td>
                    <Td numerica>{l.pico == null ? "—" : numero(l.pico)}</Td>
                    <Td numerica>{l.tempo_medio_s == null ? "—" : dur(Math.round(Number(l.tempo_medio_s)))}</Td>
                    <Td numerica>{l.ctr == null ? "—" : pct(Number(l.ctr) * (Number(l.ctr) <= 1 ? 100 : 1))}</Td>
                    <Td numerica>{l.receita_por_hora == null ? "—" : brl(l.receita_por_hora, 0)}</Td>
                  </Tr>
                ))}
              </tbody>
            </Tabela>
          )}
        </Card>
        <Card>
          <CardHeader titulo="Saúde para afiliados" descricao="SPS (nota da loja no TikTok)" />
          {lojasTik.length === 0 ? (
            <p className="text-[13px] text-texto-2">Sem loja TikTok no escopo.</p>
          ) : (
            lojasTik.map((l) => {
              const s = spsPorLoja.get(l.id);
              return (
                <div key={l.id} className="mb-3">
                  <div className="flex items-center justify-between text-[13px]">
                    <span className="font-medium text-texto">{l.apelido}</span>
                    {s ? <Chip cor={s.sps >= 3.5 ? "verde" : s.sps >= 3 ? "amarelo" : "vermelho"}>{s.sps.toFixed(1)} · {fmtData(s.dia)}</Chip> : <Chip cor="cinza">sem lançamento</Chip>}
                  </div>
                  {s && <Barra className="mt-1" pct={(s.sps / 5) * 100} cor={s.sps >= 3.5 ? "bg-sucesso" : s.sps >= 3 ? "bg-alerta" : "bg-perigo"} />}
                </div>
              );
            })
          )}
          <p className="text-[11px] text-texto-2">Abaixo de 3,0 o TikTok bloqueia novas parcerias; 3,5 é a meta. Sem API no Brasil: valor lançado ou capturado do Seller Center.</p>
        </Card>
      </div>

      <Card className="mt-6" semPadding>
        <CardHeader className="px-[18px] pt-4" titulo="Lives de criadores" descricao={`afiliados que fizeram live com produtos da loja · só lives com 5 min ou mais, ou com venda${curtasIgnoradas ? ` (${curtasIgnoradas} sessões curtas ignoradas)` : ""} · receita = pedidos de afiliados (conteúdo LIVE) do criador na janela da live`} />
        <Tabela>
          <thead>
            <tr>
              <Th>Data</Th>
              <Th>Criador</Th>
              <Th>Duração</Th>
              <Th numerica>Espectadores</Th>
              <Th numerica>Pico</Th>
              <Th numerica>Tempo médio</Th>
              <Th numerica>Pedidos</Th>
              <Th numerica>Receita</Th>
              <Th numerica>Comissão</Th>
            </tr>
          </thead>
          <tbody>
            {criadoresComReceita.length === 0 && (
              <Tr>
                <Td colSpan={9} className="text-texto-2">Nenhuma live de criador no período.</Td>
              </Tr>
            )}
            {criadoresComReceita
              .sort((a, b) => b.af.receita - a.af.receita || String(b.inicio).localeCompare(String(a.inicio)))
              .slice(0, 60)
              .map((l) => (
                <Tr key={l.id}>
                  <Td>{fmtData(l.inicio, true)}</Td>
                  <Td>
                    <p className="font-medium text-texto">{l.criador_nome ?? l.criador_usuario}</p>
                    <p className="text-xs text-texto-2">@{l.criador_usuario}</p>
                  </Td>
                  <Td>{dur(l.duracao_s)}</Td>
                  <Td numerica>{l.espectadores == null ? "—" : numero(l.espectadores)}</Td>
                  <Td numerica>{l.pico == null ? "—" : numero(l.pico)}</Td>
                  <Td numerica>{l.tempo_medio_s == null ? "—" : dur(Math.round(Number(l.tempo_medio_s)))}</Td>
                  <Td numerica>{numero(l.af.pedidos)}</Td>
                  <Td numerica className="font-semibold">{brl(l.af.receita, 0)}</Td>
                  <Td numerica>{brl(l.af.comissao, 0)}</Td>
                </Tr>
              ))}
          </tbody>
        </Tabela>
        <div className="px-[18px] py-3">
          <Dica>A API de analytics do TikTok devolve receita zero na maioria das lives de criadores; por isso a receita aqui vem dos pedidos de afiliados com conteúdo “LIVE”, casados pelo nome de usuário do criador e pela janela da live (até 2 h depois do fim).</Dica>
        </div>
      </Card>

      <Card className="mt-6" semPadding>
        <CardHeader className="px-[18px] pt-4" titulo="Afiliados que mais venderam" descricao="TikTok (todos os conteúdos) · Shopee (AMS, por dia)" />
        <Tabela>
          <thead>
            <tr>
              <Th>Criador</Th>
              <Th>Canal</Th>
              <Th>Conteúdo</Th>
              <Th numerica>Pedidos</Th>
              <Th numerica>Receita</Th>
              <Th numerica>Valor da comissão</Th>
              <Th>Pagamento</Th>
            </tr>
          </thead>
          <tbody>
            {topCriadores.length === 0 && (
              <Tr>
                <Td colSpan={7} className="text-texto-2">Sem vendas de afiliados no período.</Td>
              </Tr>
            )}
            {topCriadores.map((c) => (
              <Tr key={c.nome + c.canal}>
                <Td className="font-medium">{c.nome}</Td>
                <Td>
                  <ChipCanal canal={c.canal} />
                </Td>
                <Td>
                  <Chip cor="cinza">{c.conteudo || "—"}</Chip>
                </Td>
                <Td numerica>{numero(c.pedidos)}</Td>
                <Td numerica className="font-semibold">{brl(c.receita, 0)}</Td>
                <Td numerica>{brl(c.comissao, 0)}</Td>
                <Td>{c.canal === "tiktok" ? <Chip cor={c.pendente ? "amarelo" : "verde"}>{c.pendente ? `${c.pendente} pendente(s)` : "Liquidado"}</Chip> : <span className="text-texto-2">—</span>}</Td>
              </Tr>
            ))}
          </tbody>
        </Tabela>
      </Card>

      <div className="mt-6">
        <Lancamentos lojas={(lojasInfo || []).map((l) => ({ id: l.id, apelido: l.apelido, canal: l.marketplace === "tiktok_shop" ? "tiktok" : "shopee" }))} />
      </div>
    </div>
  );
}
