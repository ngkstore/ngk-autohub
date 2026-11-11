import { escopoDoUsuario, filtroLojas } from "@/lib/conta";
import { supabase } from "@/lib/supabase";
import { brl, numero, pct, data as fmtData, agoraMs } from "@/lib/formato";
import Lancamentos from "./Lancamentos";
import { Card, CardHeader, Kpi, Chip, ChipCanal, Segmentado, Tabela, Th, Tr, Td, Vazio, Barra, LinhaDetalhe, BotaoLink } from "../components/ui";

export const dynamic = "force-dynamic";

const dur = (s: number | null) => (s == null ? "—" : s >= 3600 ? `${Math.floor(s / 3600)}h ${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`);

export default async function LivesPage({ searchParams }: { searchParams: Promise<{ loja?: string; canal?: string; periodo?: string }> }) {
  const params = await searchParams;
  const escopo = await escopoDoUsuario();
  const lojas = filtroLojas(escopo, params.loja);
  const canal = params.canal === "tiktok" || params.canal === "shopee" ? params.canal : "todos";
  const dias = params.periodo === "7dias" ? 7 : params.periodo === "hoje" ? 1 : params.periodo === "ano" ? 365 : params.periodo === "todos" ? 3650 : 30;
  const desde = new Date(agoraMs() - dias * 86400000).toISOString();
  const antes = new Date(agoraMs() - 2 * dias * 86400000).toISOString();

  let ql = supabase.from("lives").select("id, canal, loja_id, origem, tipo_conta, criador_nome, criador_usuario, inicio, duracao_s, receita, pedidos, espectadores, pico, tempo_medio_s, ctr, receita_por_hora, lojas(apelido)").gte("inicio", antes).order("inicio", { ascending: false }).limit(1000);
  if (lojas) ql = ql.in("loja_id", lojas);
  if (canal !== "todos") ql = ql.eq("canal", canal);
  const [{ data: livesRaw }, { data: lojasInfo }, { data: spsRaw }, { data: afTik }, { data: afShop }] = await Promise.all([
    ql,
    supabase.from("lojas").select("id, apelido, marketplace").in("id", lojas ?? escopo.lojaIds),
    supabase.from("sps_lancamentos").select("loja_id, dia, sps").order("dia", { ascending: false }).limit(50),
    (() => {
      let q = supabase.from("tiktok_afiliado_pedidos").select("criador_usuario, conteudo_tipo, taxa_comissao, comissao_estimada, comissao_paga, base_comissao, status_liquidacao, criado_em").gte("criado_em", desde).limit(5000);
      if (lojas) q = q.in("loja_id", lojas);
      return q;
    })(),
    (() => {
      let q = supabase.from("afiliados_afiliado_dia").select("affiliate_username, affiliate_name, vendas, pedidos, comissao, data").gte("data", desde.slice(0, 10)).limit(5000);
      if (lojas) q = q.in("loja_id", lojas);
      return q;
    })(),
  ]);
  type L = { id: string; canal: "shopee" | "tiktok"; loja_id: string; origem: string; tipo_conta: string | null; criador_nome: string | null; criador_usuario: string | null; inicio: string | null; duracao_s: number | null; receita: number; pedidos: number; espectadores: number | null; pico: number | null; tempo_medio_s: number | null; ctr: number | null; receita_por_hora: number | null; lojas: { apelido: string } | null };
  const todas = ((livesRaw || []) as unknown) as L[];
  const lives = todas.filter((l) => l.inicio && l.inicio >= desde);
  const anteriores = todas.filter((l) => l.inicio && l.inicio < desde);
  const soma = (xs: L[], f: (l: L) => number) => xs.reduce((s, l) => s + (f(l) || 0), 0);
  const receita = soma(lives, (l) => Number(l.receita));
  const receitaAnt = soma(anteriores, (l) => Number(l.receita));
  const varPct = receitaAnt > 0 ? ((receita - receitaAnt) / receitaAnt) * 100 : null;
  const horas = soma(lives, (l) => Number(l.duracao_s || 0)) / 3600;
  const receitaHora = horas > 0 ? receita / horas : 0;
  const pico = Math.max(0, ...lives.map((l) => Number(l.pico || 0)));
  const porCanal = (c: string) => soma(lives.filter((l) => l.canal === c), (l) => Number(l.receita));
  const horasCanal = (c: string) => soma(lives.filter((l) => l.canal === c), (l) => Number(l.duracao_s || 0)) / 3600;
  const afiliadoReceita = (afTik || []).reduce((s, a) => s + Number(a.base_comissao || 0), 0);
  const melhor = [...lives].sort((a, b) => Number(b.receita) - Number(a.receita))[0];
  const maxReceita = Math.max(1, ...lives.map((l) => Number(l.receita)));

  // afiliados que mais venderam
  const criadores = new Map<string, { nome: string; conteudo: string; pedidos: number; receita: number; comissao: number; taxa: number | null; pago: number; pendente: number; canal: "tiktok" | "shopee" }>();
  for (const a of afTik || []) {
    const k = `tt|${a.criador_usuario ?? "?"}`;
    const c = criadores.get(k) || { nome: `@${a.criador_usuario ?? "?"}`, conteudo: a.conteudo_tipo ?? "", pedidos: 0, receita: 0, comissao: 0, taxa: a.taxa_comissao == null ? null : Number(a.taxa_comissao), pago: 0, pendente: 0, canal: "tiktok" };
    c.pedidos++;
    c.receita += Number(a.base_comissao || 0);
    c.comissao += Number(a.comissao_paga ?? a.comissao_estimada ?? 0);
    if (a.comissao_paga != null) c.pago++;
    else c.pendente++;
    criadores.set(k, c);
  }
  if (canal !== "tiktok") {
    for (const a of afShop || []) {
      const k = `sh|${a.affiliate_username ?? a.affiliate_name ?? "?"}`;
      const c = criadores.get(k) || { nome: `@${a.affiliate_username ?? a.affiliate_name ?? "?"}`, conteudo: "AMS", pedidos: 0, receita: 0, comissao: 0, taxa: null, pago: 0, pendente: 0, canal: "shopee" };
      c.pedidos += Number(a.pedidos || 0);
      c.receita += Number(a.vendas || 0);
      c.comissao += Number(a.comissao || 0);
      criadores.set(k, c);
    }
  }
  const topCriadores = [...criadores.values()].filter((c) => canal === "todos" || c.canal === canal).sort((a, b) => b.receita - a.receita).slice(0, 10);
  const lojasTik = (lojasInfo || []).filter((l) => l.marketplace === "tiktok_shop");
  const spsPorLoja = new Map<string, { dia: string; sps: number }>();
  for (const s of spsRaw || []) if (!spsPorLoja.has(s.loja_id)) spsPorLoja.set(s.loja_id, { dia: s.dia, sps: Number(s.sps) });
  const link = (c: string) => `/lives?canal=${c}${params.loja ? `&loja=${params.loja}` : ""}${params.periodo ? `&periodo=${params.periodo}` : ""}`;

  return (
    <div className="mx-auto max-w-[1400px] p-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold tracking-[-0.01em] text-texto">Lives e afiliados</h1>
          <p className="mt-0.5 text-[13px] text-texto-2">TikTok Shop e Shopee · desempenho das lives, vídeos e criadores parceiros · período do topo</p>
        </div>
        <Segmentado rotulo="Canal" ativa={canal} opcoes={[{ id: "todos", nome: "Todos", href: link("todos") }, { id: "tiktok", nome: "TikTok", href: link("tiktok") }, { id: "shopee", nome: "Shopee", href: link("shopee") }]} />
      </div>

      <div className="grid grid-cols-2 gap-3.5 md:grid-cols-5">
        <Kpi icone="lives" cor="indigo" rotulo="Receita das lives" valor={brl(receita, 0)} variacao={varPct ?? undefined} detalhe={`TikTok ${brl(porCanal("tiktok"), 0)} · Shopee ${brl(porCanal("shopee"), 0)}`} />
        <Kpi icone="painel" cor="ceu" rotulo="Horas ao vivo" valor={`${numero(horas, 0)} h`} detalhe={`${numero(horasCanal("tiktok"), 0)} TikTok · ${numero(horasCanal("shopee"), 0)} Shopee`} />
        <Kpi icone="financas" cor="verde" rotulo="Receita por hora" valor={brl(receitaHora, 0)} />
        <Kpi icone="insights" cor="roxo" rotulo="Pico de espectadores" valor={numero(pico)} />
        <Kpi icone="ads" cor="laranja" rotulo="Receita via afiliados" valor={brl(afiliadoReceita, 0)} detalhe={receita > 0 ? `${pct((afiliadoReceita / Math.max(receita, afiliadoReceita)) * 100, 0)} da receita TikTok` : "pedidos de afiliados TikTok"} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader titulo="Receita por live" descricao={melhor ? `melhor: ${fmtData(melhor.inicio)} · ${brl(melhor.receita, 0)}` : undefined} />
          {lives.length === 0 ? (
            <Vazio titulo="Nenhuma live no período" texto="As lives do TikTok entram pela API (madrugada e botão Sincronizar); as da Shopee pelo lançamento manual." />
          ) : (
            <div className="space-y-1.5">
              {lives.slice(0, 20).map((l) => (
                <div key={l.id} className="flex items-center gap-3 text-[13px]">
                  <span className="w-24 shrink-0 text-texto-2">{fmtData(l.inicio, true)}</span>
                  <div className="flex-1">
                    <Barra pct={(Number(l.receita) / maxReceita) * 100} cor={l.canal === "tiktok" ? "bg-chip-tiktok-fundo" : "bg-alerta"} />
                  </div>
                  <span className="w-24 shrink-0 text-right font-semibold text-texto">{brl(l.receita, 0)}</span>
                </div>
              ))}
            </div>
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
        <CardHeader className="px-[18px] pt-4" titulo="Lives" acoes={<BotaoLink href="/lives?canal=tiktok" pequeno>Ver só TikTok</BotaoLink>} />
        <Tabela>
          <thead>
            <tr>
              <Th>Data</Th>
              <Th>Canal</Th>
              <Th>Quem</Th>
              <Th>Duração</Th>
              <Th numerica>Receita</Th>
              <Th numerica>Pedidos</Th>
              <Th numerica>Pico</Th>
              <Th numerica>Tempo médio</Th>
              <Th numerica>Clique no produto</Th>
              <Th numerica>Receita/hora</Th>
            </tr>
          </thead>
          <tbody>
            {lives.length === 0 && (
              <Tr>
                <Td colSpan={10} className="text-texto-2">Nenhuma live no período.</Td>
              </Tr>
            )}
            {lives.slice(0, 100).map((l) => (
              <Tr key={l.id}>
                <Td>{fmtData(l.inicio, true)}</Td>
                <Td>
                  <ChipCanal canal={l.canal} />
                </Td>
                <Td className="text-texto-2">{l.criador_nome ?? l.criador_usuario ?? (l.origem === "manual" ? "lançamento manual" : l.tipo_conta === "OFFICIAL_ACCOUNTS" ? "conta da loja" : "—")}</Td>
                <Td>{dur(l.duracao_s)}</Td>
                <Td numerica className="font-semibold">{brl(l.receita, 0)}</Td>
                <Td numerica>{numero(l.pedidos)}</Td>
                <Td numerica>{l.pico == null ? "—" : numero(l.pico)}</Td>
                <Td numerica>{l.tempo_medio_s == null ? "—" : dur(Math.round(Number(l.tempo_medio_s)))}</Td>
                <Td numerica>{l.ctr == null ? "—" : pct(Number(l.ctr) * (Number(l.ctr) <= 1 ? 100 : 1))}</Td>
                <Td numerica>{l.receita_por_hora == null ? "—" : brl(l.receita_por_hora, 0)}</Td>
              </Tr>
            ))}
          </tbody>
        </Tabela>
      </Card>

      <Card className="mt-6" semPadding>
        <CardHeader className="px-[18px] pt-4" titulo="Afiliados que mais venderam" descricao="TikTok (pedidos de afiliados) · Shopee (AMS, por dia)" />
        <Tabela>
          <thead>
            <tr>
              <Th>Criador</Th>
              <Th>Canal</Th>
              <Th>Conteúdo</Th>
              <Th numerica>Pedidos</Th>
              <Th numerica>Receita</Th>
              <Th numerica>Comissão</Th>
              <Th numerica>Valor da comissão</Th>
              <Th>Pagamento</Th>
            </tr>
          </thead>
          <tbody>
            {topCriadores.length === 0 && (
              <Tr>
                <Td colSpan={8} className="text-texto-2">Sem vendas de afiliados no período.</Td>
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
                <Td numerica>{c.taxa == null ? "—" : pct(c.taxa, 0)}</Td>
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
      <div className="mt-4">
        <LinhaDetalhe rotulo="Minuto a minuto das lives" valor="permissão negada ao app pela API do TikTok (sondado em 11/11/2026)" />
      </div>
    </div>
  );
}
