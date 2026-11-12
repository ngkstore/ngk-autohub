import Link from "next/link";
import { notFound } from "next/navigation";
import { escopoDoUsuario, podeVerLoja } from "@/lib/conta";
import { aprovacoesDoCaso, carregarCaso, eventosDoCaso, inspecaoDoCaso, midiasDoCaso, pedidoDoCaso } from "@/lib/devolucoes/consultas";
import { custoCaminhos } from "@/lib/devolucoes/custos";
import { riscoDoComprador } from "@/lib/devolucoes/risco";
import { textoCobranca } from "@/lib/devolucoes/credito";
import { brl, data as fmtData, prazoRelativo, urgenciaDoPrazo } from "@/lib/formato";
import ResponderCaso from "./ResponderCaso";
import { motivoLegivel } from "@/lib/devolucoes/motivos";
import { Card, CardHeader, Chip, ChipCanal, ChipPrazo, Tabela, Th, Tr, Td, BotaoLink, Dica, Aviso, LinhaDetalhe } from "../../components/ui";

export const dynamic = "force-dynamic";

const ETAPAS = [
  { id: "solicitado", nome: "Solicitado" },
  { id: "resposta", nome: "Sua resposta" },
  { id: "voltando", nome: "Produto voltando" },
  { id: "coleta", nome: "Agendar coleta" },
  { id: "recebido", nome: "Recebido" },
  { id: "validar", nome: "Validar / analisar reembolso" },
  { id: "inspecao", nome: "Inspeção" },
  { id: "decisao", nome: "Reembolso ou disputa" },
  { id: "encerrado", nome: "Encerrado" },
];
const ORIGEM: Record<string, { nome: string; cor: "cinza" | "azul" | "verde" | "roxo" | "laranja" | "ceu" }> = {
  plataforma: { nome: "Plataforma", cor: "cinza" },
  comprador: { nome: "Comprador", cor: "azul" },
  vendedor: { nome: "Loja", cor: "verde" },
  assistente: { nome: "Assistente", cor: "roxo" },
  sistema: { nome: "Sistema", cor: "ceu" },
  equipe: { nome: "Equipe", cor: "laranja" },
};

export default async function CasoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const escopo = await escopoDoUsuario();
  const d = await carregarCaso(id);
  if (!d || !podeVerLoja(escopo, d.loja_id)) notFound();
  const [midias, eventos, insp, aprovacoes, pedido, custos, risco] = await Promise.all([midiasDoCaso(id), eventosDoCaso(id), inspecaoDoCaso(id), aprovacoesDoCaso(id), pedidoDoCaso(d.loja_id, d.pedido_id), custoCaminhos(d), riscoDoComprador(d.canal, d.comprador_id)]);
  const etapaIdx = Math.max(0, ETAPAS.findIndex((e) => e.id === d.etapa));
  const doComprador = midias.filter((m) => m.origem === "comprador");
  const nossas = midias.filter((m) => m.origem === "nos");
  const s = d.sugestao;
  const item = d.itens?.[0];
  const prazo = d.prazo_resposta ?? d.prazo_prova;
  const pendente = aprovacoes.find((a) => !a.decisao && !a.executada_em);

  return (
    <>
      <p className="mb-2 text-xs text-texto-2">
        <Link href="/devolucoes" className="hover:underline">
          Fila
        </Link>{" "}
        / Devoluções / Caso
      </p>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold tracking-[-0.01em] text-texto">{item?.nome ?? d.pedido_id}</h1>
          <p className="mt-0.5 text-[13px] text-texto-2">
            Devolução {d.plataforma_id} · pedido {d.pedido_id} · {d.lojas?.apelido ?? ""}
            {d.comprador_usuario ? ` · comprador ${d.comprador_usuario}` : ""}
            {risco.devolucoes_90d ? ` · ${risco.devolucoes_90d} devolução(ões) em 90 dias` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ChipCanal canal={d.canal} />
          {prazo && <ChipPrazo urgencia={urgenciaDoPrazo(prazo)}>{d.etapa === "encerrado" ? fmtData(prazo) : `responder ${prazoRelativo(prazo)}`}</ChipPrazo>}
          {risco.suspeito && <Chip cor="vermelho">comprador suspeito</Chip>}
          {d.resultado && <Chip cor={d.resultado === "ganha" || d.resultado === "recusada" ? "verde" : d.resultado === "perdida" ? "vermelho" : "cinza"}>{d.resultado}</Chip>}
        </div>
      </div>

      {/* Etapas */}
      <ol className="mb-6 flex flex-wrap gap-2">
        {ETAPAS.map((e, i) => (
          <li key={e.id} className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${i < etapaIdx ? "bg-chip-verde-fundo text-chip-verde-texto" : i === etapaIdx ? "bg-primaria text-white" : "bg-superficie-2 text-texto-2"}`}>
            <span>{i < etapaIdx ? "✓" : i + 1}</span> {e.nome}
          </li>
        ))}
      </ol>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card>
            <CardHeader titulo="O que o comprador diz" acoes={<Chip cor={d.tipo === "falha_entrega" ? "laranja" : "azul"}>{d.tipo === "falha_entrega" ? "Falha de entrega" : d.tipo.replace("_", " + ")}</Chip>} />
            <div className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
              <LinhaDetalhe rotulo="Motivo" valor={`${motivoLegivel(d.motivo_codigo, d.motivo_texto)}${d.motivo_codigo ? ` (${d.motivo_codigo})` : ""}`} />
              <LinhaDetalhe rotulo="Valor pedido" valor={`${brl(d.valor_reembolso_pedido)}${d.valor_pedido ? ` de ${brl(d.valor_pedido)}` : ""}`} destaque />
              <LinhaDetalhe rotulo="Aberto em" valor={fmtData(d.plataforma_criado_em, true)} />
              <LinhaDetalhe rotulo="Status na plataforma" valor={d.status_plataforma ?? "-"} />
              {d.rastreio_reverso && <LinhaDetalhe rotulo="Rastreio reverso" valor={`${d.rastreio_reverso}${d.transportadora_reversa ? ` · ${d.transportadora_reversa}` : ""}`} />}
              {d.chegou_em && <LinhaDetalhe rotulo="Chegou ao armazém" valor={fmtData(d.chegou_em, true)} />}
            </div>
            {d.texto_comprador && <blockquote className="mt-3 rounded-[10px] border border-linha bg-superficie-2 p-3 text-[13px] italic text-texto">“{d.texto_comprador}”</blockquote>}
            {(d.itens || []).length > 1 && <p className="mt-2 text-xs text-texto-2">Itens: {(d.itens || []).map((i) => `${i.quantidade}× ${i.nome}`).join("; ")}</p>}
            {doComprador.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {doComprador.map((m) =>
                  m.url ? (
                    m.tipo === "video" ? (
                      <video key={m.id} src={m.url} controls className="h-28 rounded-[10px] bg-black" />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <a key={m.id} href={m.url} target="_blank" rel="noreferrer"><img src={m.url} alt={m.legenda ?? "foto do comprador"} className="h-28 w-28 rounded-[10px] object-cover" /></a>
                    )
                  ) : null
                )}
              </div>
            )}
            {s?.motivos?.length ? <Dica className="mt-3"><b>Leitura do assistente:</b> {s.motivos.join(" ")}</Dica> : null}
          </Card>

          <Card>
            <CardHeader titulo="Nossas provas" acoes={<BotaoLink href={`/devolucoes/recebimento?q=${encodeURIComponent(d.plataforma_id)}`} pequeno>Anexar prova</BotaoLink>} />
            <div className="space-y-1">
              <LinhaDetalhe rotulo="Peso de envio" valor={insp?.peso_envio_kg != null ? `${insp.peso_envio_kg} kg` : "não registrado"} />
              <LinhaDetalhe rotulo="Peso na chegada" valor={insp?.peso_chegada_kg != null ? `${insp.peso_chegada_kg} kg${insp.peso_envio_kg ? ` (${Math.round(((Number(insp.peso_envio_kg) - Number(insp.peso_chegada_kg)) / Number(insp.peso_envio_kg)) * 100)}% abaixo)` : ""}` : "não pesado"} />
              <LinhaDetalhe rotulo="Inspeção" valor={insp ? `${insp.estado ?? "-"} → ${insp.destino ?? "-"}${insp.observacao ? ` · ${insp.observacao}` : ""}` : "ainda não feita"} />
              <LinhaDetalhe rotulo="Pedido" valor={pedido ? `${brl(pedido.valor_total)} · ${pedido.status ?? ""} · ${pedido.uf ?? ""} · ${fmtData(pedido.data_pedido)}` : "não encontrado no AutoHub"} />
            </div>
            {nossas.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {nossas.map((m) =>
                  m.url ? (
                    m.tipo === "video" ? (
                      <div key={m.id} className="flex flex-col items-start gap-1">
                        <video src={m.url} controls className="h-28 rounded-[10px] bg-black" />
                        <a href={m.url} download className="text-xs text-primaria hover:underline">baixar para enviar no Seller Center</a>
                      </div>
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <a key={m.id} href={m.url} target="_blank" rel="noreferrer" title={m.legenda ?? ""}><img src={m.url} alt={m.legenda ?? "prova"} className="h-28 w-28 rounded-[10px] object-cover" /></a>
                    )
                  ) : null
                )}
              </div>
            ) : (
              <Aviso className="mt-3">Vídeo da embalagem no envio não gravamos: a prova principal será o vídeo de abertura quando o produto voltar (Recebimento e inspeção).</Aviso>
            )}
          </Card>

          <Card>
            <CardHeader titulo="Histórico" descricao="plataforma, comprador, assistente e equipe juntos" />
            {eventos.length === 0 ? (
              <p className="text-[13px] text-texto-2">Sem eventos.</p>
            ) : (
              <ul className="divide-y divide-linha">
                {eventos.map((e) => (
                  <li key={e.id} className="flex gap-3 py-2 text-[13px]">
                    <span className="w-24 shrink-0 text-xs text-texto-2">{fmtData(e.quando, true)}</span>
                    <Chip cor={ORIGEM[e.origem]?.cor ?? "cinza"}>{ORIGEM[e.origem]?.nome ?? e.origem}</Chip>
                    <span className="text-texto">{e.descricao ?? e.tipo}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader titulo="Recomendação" acoes={s ? <Chip cor={s.confianca === "alta" ? "verde" : s.confianca === "media" ? "amarelo" : "cinza"}>confiança {s.confianca}</Chip> : undefined} />
            {s ? (
              <>
                <p className="text-[15px] font-semibold text-texto">{{ aprovar: "Aprovar a devolução", recusar: "Recusar com prova", oferecer_parcial: `Oferecer parcial${s.valor_parcial ? ` de ${brl(s.valor_parcial)}` : ""}`, disputar: "Abrir disputa", aceitar_contraproposta: "Aceitar a contraproposta", aguardar: "Aguardar" }[s.decisao]}</p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-[13px] text-texto">
                  {s.motivos.map((m, i) => (
                    <li key={i}>{m}</li>
                  ))}
                </ul>
                {s.mensagem_comprador && <p className="mt-2 text-xs text-texto-2">Mensagem sugerida: “{s.mensagem_comprador}”</p>}
                <p className="mt-2 text-[11px] text-texto-2">gerada {fmtData(s.gerada_em, true)} · {s.modelo}</p>
              </>
            ) : (
              <p className="text-[13px] text-texto-2">O assistente ainda não analisou este caso. Ele passa a cada 15 min pelos casos que precisam de decisão.</p>
            )}
          </Card>

          <Card semPadding>
            <CardHeader className="px-[18px] pt-4" titulo="Quanto custa cada caminho" />
            <Tabela>
              <thead>
                <tr>
                  <Th>Caminho</Th>
                  <Th numerica>Perda provável</Th>
                </tr>
              </thead>
              <tbody>
                <Tr><Td>Aprovar e inspecionar (produto volta)</Td><Td numerica>{brl(custos.aprovar_total)}</Td></Tr>
                <Tr><Td>Aprovar sem devolução</Td><Td numerica>{brl(custos.aprovar_sem_devolucao)}</Td></Tr>
                <Tr><Td>Recusar e ganhar</Td><Td numerica>{brl(0)}</Td></Tr>
                <Tr><Td>Deixar vencer</Td><Td numerica>{brl(custos.aprovar_sem_devolucao)}</Td></Tr>
              </tbody>
            </Tabela>
            <div className="px-[18px] pb-4 pt-2">
              <LinhaDetalhe rotulo="Repasse em risco" valor={brl(custos.repasse_em_risco)} destaque />
              <LinhaDetalhe rotulo="Afiliado (estornado se reembolsar)" valor={`−${brl(custos.afiliado_estornado)}`} />
              <LinhaDetalhe rotulo="Frete do vendedor" valor={`−${brl(custos.frete_vendedor)}`} />
              <LinhaDetalhe rotulo="Custo do produto (volta se OK)" valor={custos.fonte.custo_itens ? brl(custos.custo_produto) : "sem custo cadastrado"} />
            </div>
          </Card>

          {d.credito_status && d.credito_status !== "nao_se_aplica" && (
            <Card>
              <CardHeader titulo="Crédito na conta" acoes={<Chip cor={d.credito_status === "creditado" ? "verde" : d.credito_status === "nao_creditado" ? "vermelho" : "amarelo"}>{d.credito_status.replace("_", " ")}</Chip>} />
              <LinhaDetalhe rotulo="Esperado até" valor={d.credito_esperado_ate ? fmtData(d.credito_esperado_ate) : "-"} />
              <LinhaDetalhe rotulo="Creditado em" valor={d.creditado_em ? fmtData(d.creditado_em, true) : "-"} />
              {d.credito_status === "nao_creditado" && <textarea readOnly className="mt-2 h-32 w-full rounded-lg border border-borda bg-superficie-2 p-2 text-xs text-texto" value={textoCobranca(d)} />}
            </Card>
          )}

          <ResponderCaso id={d.id} canal={d.canal} etapa={d.etapa} sugestao={s ? { decisao: s.decisao, motivo_plataforma: s.motivo_plataforma, valor_parcial: s.valor_parcial, mensagem: s.mensagem_comprador } : null} valorReembolso={Number(d.valor_reembolso_pedido || 0)} quadros={nossas.filter((m) => m.tipo === "quadro" || m.tipo === "foto").map((m) => ({ id: m.id, storage_path: m.storage_path, legenda: m.legenda, url: m.url }))} pendente={pendente ? { id: pendente.id as string, acao: (pendente.acao as { tipo: string }).tipo, via: pendente.via as string } : null} />
        </div>
      </div>
    </>
  );
}
