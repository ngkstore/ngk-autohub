import Link from "next/link";
import { escopoDoUsuario, filtroLojas } from "@/lib/conta";
import { ABAS_FILA, feitoHoje, listarDevolucoes, type DevolucaoResumo } from "@/lib/devolucoes/consultas";
import { brl, prazoRelativo, urgenciaDoPrazo, data as fmtData } from "@/lib/formato";
import Cabecalho from "./Cabecalho";
import SelecaoLote from "./SelecaoLote";
import { Card, CardHeader, Kpi, Chip, ChipCanal, ChipPrazo, Tabs, Tabela, Th, Tr, Td, Produto, BotaoLink, Vazio, Segmentado } from "../components/ui";

export const dynamic = "force-dynamic";

const MOTIVOS: { id: string; nome: string; casa: (m: string) => boolean }[] = [
  { id: "defeito", nome: "Produto com defeito", casa: (m) => /FUNCTIONAL|DEFECT|damaged|defective|DAMAGE/i.test(m) },
  { id: "diferente", nome: "Diferente do anúncio", casa: (m) => /NOT_MATCH|DIFFERENT|not_match|WRONG/i.test(m) },
  { id: "nao_recebido", nome: "Não recebido", casa: (m) => /NOT_RECEIVED|not_received|NON_RECEIPT/i.test(m) },
  { id: "faltando", nome: "Faltando peça", casa: (m) => /MISSING|missing|INCOMPLETE/i.test(m) },
  { id: "arrependimento", nome: "Arrependimento", casa: (m) => /CHANGE_OF_MIND|change_mind|NO_LONGER|DONT_WANT/i.test(m) },
];
const SUGESTOES = [
  { id: "aprovar", nome: "Aprovar" },
  { id: "recusar", nome: "Recusar com prova" },
  { id: "oferecer_parcial", nome: "Oferecer parcial" },
  { id: "disputar", nome: "Disputar" },
  { id: "aguardar", nome: "Aguardar" },
];

function rotuloSugestao(d: DevolucaoResumo) {
  const s = d.sugestao;
  if (!s) return d.regra_id ? "regra aplicada" : "—";
  const nome: Record<string, string> = { aprovar: "Aprovar", recusar: "Recusar com prova", oferecer_parcial: `Oferecer parcial${s.valor_parcial ? ` ${brl(s.valor_parcial)}` : ""}`, disputar: "Disputar", aceitar_contraproposta: "Aceitar contraproposta", aguardar: "Aguardar" };
  return `${nome[s.decisao] ?? s.decisao} · ${s.confianca}`;
}

export default async function DevolucoesPage({ searchParams }: { searchParams: Promise<{ loja?: string; aba?: string; motivo?: string; sugestao?: string; periodo?: string }> }) {
  const params = await searchParams;
  const escopo = await escopoDoUsuario();
  const lojas = filtroLojas(escopo, params.loja);
  const aba = params.aba || "responder";
  const [abertas, encerradas, feito] = await Promise.all([listarDevolucoes(lojas), aba === "encerradas" ? listarDevolucoes(lojas, { encerradas: true, limite: 200 }) : Promise.resolve([] as DevolucaoResumo[]), feitoHoje(lojas)]);
  const todas = [...abertas, ...encerradas];

  const agora = new Date();
  const em24h = agora.getTime() + 24 * 3600000;
  const vencem24 = abertas.filter((d) => d.prazo_resposta && new Date(d.prazo_resposta).getTime() <= em24h && new Date(d.prazo_resposta) > agora).length;
  const vencidas = abertas.filter((d) => d.prazo_resposta && new Date(d.prazo_resposta) <= agora && ["resposta", "decisao"].includes(d.etapa)).length;
  const emDisputa = abertas.reduce((s, d) => s + Number(d.valor_reembolso_pedido || 0), 0);
  const semana = abertas.filter((d) => d.plataforma_criado_em && agora.getTime() - new Date(d.plataforma_criado_em).getTime() < 7 * 86400000).length;
  const comSugestao = abertas.filter((d) => d.sugestao || d.regra_id).length;
  const ganhas = todas.filter((d) => d.resultado === "ganha").length;
  const perdidas = todas.filter((d) => d.resultado === "perdida").length;
  const recuperado = todas.reduce((s, d) => s + Number(d.valor_recuperado || 0), 0);

  const contagem: Record<string, number> = {};
  for (const a of ABAS_FILA) contagem[a.id] = (a.id === "encerradas" ? encerradas : abertas).filter((d) => (a.etapas ? a.etapas.includes(d.etapa) : a.filtro ? a.filtro(d) : false)).length;
  const abaDef = ABAS_FILA.find((a) => a.id === aba) ?? ABAS_FILA[0];
  let lista = (aba === "encerradas" ? encerradas : abertas).filter((d) => (abaDef.etapas ? abaDef.etapas.includes(d.etapa) : abaDef.filtro ? abaDef.filtro(d) : true));
  const motivoSel = MOTIVOS.find((m) => m.id === params.motivo);
  if (motivoSel) lista = lista.filter((d) => motivoSel.casa(`${d.motivo_codigo ?? ""} ${d.motivo_texto ?? ""}`));
  if (params.sugestao) lista = lista.filter((d) => d.sugestao?.decisao === params.sugestao);

  const qs = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const base = { aba, motivo: params.motivo, sugestao: params.sugestao, loja: params.loja, periodo: params.periodo, ...patch };
    for (const [k, v] of Object.entries(base)) if (v) p.set(k, v);
    return `/devolucoes?${p.toString()}`;
  };
  const chegando = abertas.filter((d) => d.etapa === "voltando" || d.etapa === "recebido").sort((a, b) => (a.chegou_em ? -1 : 1) - (b.chegou_em ? -1 : 1)).slice(0, 6);

  return (
    <>
      <Cabecalho ativa="fila" titulo="Devoluções e reembolsos" descricao="Shopee e TikTok Shop numa fila só, ordenada pelo prazo. O assistente sugere a resposta de cada caso." acoes={<BotaoLink href="/devolucoes/recebimento" variante="principal">Receber devolução</BotaoLink>} />

      <div className="grid grid-cols-2 gap-3.5 md:grid-cols-3 xl:grid-cols-5">
        <Kpi icone="devolucoes" cor="indigo" rotulo="Abertas" valor={abertas.length} detalhe={`+${semana} na semana`} />
        <Kpi icone="alertas" cor={vencidas ? "vermelho" : "laranja"} rotulo="Vencem em 24 h" valor={vencem24} detalhe={vencidas ? `${vencidas} vencida(s)` : "nenhuma vencida"} />
        <Kpi icone="financas" cor="roxo" rotulo="Valor em disputa" valor={brl(emDisputa, 0)} detalhe="reembolsos pedidos" />
        <Kpi icone="insights" cor="verde" rotulo="Com sugestão do assistente" valor={abertas.length ? `${Math.round((comSugestao / abertas.length) * 100)}%` : "—"} detalhe="com sua aprovação" />
        <Kpi icone="auditoria" cor="ceu" rotulo="Disputas ganhas" valor={ganhas + perdidas ? `${Math.round((ganhas / (ganhas + perdidas)) * 100)}%` : "—"} detalhe={`${brl(recuperado, 0)} recuperados`} />
      </div>

      <div className="mt-6 space-y-6">
        <Card semPadding>
          <Tabs className="px-[18px]" abas={ABAS_FILA.map((a) => ({ id: a.id, nome: a.nome, contador: contagem[a.id], href: qs({ aba: a.id }) }))} ativa={aba} />
          <div className="flex flex-wrap items-center gap-2 px-[18px] py-3">
            <Segmentado rotulo="Motivo" ativa={params.motivo || "todos"} opcoes={[{ id: "todos", nome: "Todos os motivos", href: qs({ motivo: undefined }) }, ...MOTIVOS.map((m) => ({ id: m.id, nome: m.nome, href: qs({ motivo: m.id }) }))]} />
          </div>
          <div className="flex flex-wrap items-center gap-2 px-[18px] pb-3">
            <Segmentado rotulo="Sugestão" ativa={params.sugestao || "todas"} opcoes={[{ id: "todas", nome: "Todas as sugestões", href: qs({ sugestao: undefined }) }, ...SUGESTOES.map((s) => ({ id: s.id, nome: s.nome, href: qs({ sugestao: s.id }) }))]} />
          </div>
          {lista.length === 0 ? (
            <div className="p-[18px]">
              <Vazio titulo="Nada aqui" texto="Nenhuma devolução nesta aba com os filtros escolhidos." />
            </div>
          ) : (
            <SelecaoLote ids={lista.filter((d) => d.sugestao && d.sugestao.decisao !== "aguardar").map((d) => d.id)}>
              <Tabela>
                <thead>
                  <tr>
                    <Th>Prazo</Th>
                    <Th>Canal</Th>
                    <Th>Produto</Th>
                    <Th>Motivo</Th>
                    <Th numerica>Valor</Th>
                    <Th>Sugestão do assistente</Th>
                    <Th></Th>
                  </tr>
                </thead>
                <tbody>
                  {lista.map((d) => {
                    const prazo = d.prazo_resposta ?? d.prazo_prova;
                    const item = d.itens?.[0];
                    return (
                      <Tr key={d.id}>
                        <Td>{prazo ? <ChipPrazo urgencia={urgenciaDoPrazo(prazo)}>{prazoRelativo(prazo) || fmtData(prazo)}</ChipPrazo> : <Chip cor="cinza">{d.etapa}</Chip>}</Td>
                        <Td>
                          <ChipCanal canal={d.canal} />
                        </Td>
                        <Td>
                          <Produto nome={item?.nome ?? d.pedido_id} imagem={item?.imagem ?? null} sku={`${d.pedido_id} · ${d.lojas?.apelido ?? ""}`} />
                        </Td>
                        <Td className="max-w-[220px] truncate" title={d.texto_comprador ?? ""}>
                          {d.motivo_texto && d.motivo_texto !== d.motivo_codigo ? d.motivo_texto : d.motivo_codigo ?? "-"}
                        </Td>
                        <Td numerica className="font-semibold">{brl(d.valor_reembolso_pedido)}</Td>
                        <Td>
                          <Chip cor={d.sugestao ? (d.sugestao.decisao === "aprovar" ? "verde" : d.sugestao.decisao === "aguardar" ? "cinza" : "laranja") : "cinza"}>{rotuloSugestao(d)}</Chip>
                        </Td>
                        <Td>
                          <Link href={`/devolucoes/${d.id}`} className="text-[13px] font-medium text-primaria hover:underline">
                            Abrir
                          </Link>
                        </Td>
                      </Tr>
                    );
                  })}
                </tbody>
              </Tabela>
            </SelecaoLote>
          )}
        </Card>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <Card>
            <CardHeader titulo="Hoje o assistente fez" />
            {feito.length === 0 ? (
              <p className="text-[13px] text-texto-2">Nada ainda hoje.</p>
            ) : (
              <ul className="space-y-2">
                {feito.map((e, i) => (
                  <li key={i} className="flex gap-2.5 text-[13px] text-texto">
                    <span className="shrink-0 text-xs text-texto-2">{new Date(e.quando).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" })}</span>
                    <span>
                      {e.descricao ?? e.tipo} <span className="text-texto-2">· {e.devolucoes?.plataforma_id}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card>
            <CardHeader titulo="Chegando ao armazém" acoes={<BotaoLink href="/devolucoes/recebimento" pequeno>Abrir recebimento</BotaoLink>} />
            {chegando.length === 0 ? (
              <p className="text-[13px] text-texto-2">Nenhum pacote voltando.</p>
            ) : (
              <ul className="divide-y divide-linha">
                {chegando.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-2 py-2 text-[13px]">
                    <Link href={`/devolucoes/${d.id}`} className="min-w-0 truncate text-texto hover:underline">
                      {d.itens?.[0]?.nome ?? d.pedido_id} <span className="text-texto-2">· {d.pedido_id}</span>
                    </Link>
                    <Chip cor={d.chegou_em ? "verde" : "cinza"}>{d.chegou_em ? "no armazém · inspecionar" : d.rastreio_reverso ? "em trânsito" : "aguardando envio"}</Chip>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
