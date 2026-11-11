import Link from "next/link";
import { escopoDoUsuario, filtroLojas } from "@/lib/conta";
import { supabase } from "@/lib/supabase";
import { taxaVitoria, textoCobranca } from "@/lib/devolucoes/credito";
import { brl, data as fmtData, agoraMs } from "@/lib/formato";
import Cabecalho from "../Cabecalho";
import MarcarCreditado from "./MarcarCreditado";
import { Card, CardHeader, Kpi, Chip, ChipCanal, Tabs, Tabela, Th, Tr, Td, Vazio, PainelDetalhe, SecaoDetalhe, LinhaDetalhe, Barra } from "../../components/ui";

export const dynamic = "force-dynamic";

type D = { id: string; loja_id: string; canal: "shopee" | "tiktok"; plataforma_id: string; pedido_id: string; motivo_codigo: string | null; motivo_texto: string | null; etapa: string; disputa_status: string | null; compensacao_status: string | null; resultado: string | null; valor_reembolso_pedido: number | null; valor_recuperado: number | null; credito_status: string | null; credito_esperado_ate: string | null; creditado_em: string | null; plataforma_criado_em: string | null; plataforma_atualizado_em: string | null; itens: { nome: string | null }[] | null; lojas: { apelido: string } | null };

const ABAS = [
  { id: "todas", nome: "Todas" },
  { id: "analise", nome: "Em análise" },
  { id: "aguardando", nome: "Ganhas · aguardando crédito" },
  { id: "nao_creditado", nome: "Ganhou, não creditado" },
  { id: "creditadas", nome: "Creditadas" },
  { id: "perdidas", nome: "Perdidas" },
  { id: "recorrer", nome: "Dá para recorrer" },
];

function classificar(d: D): string[] {
  const s: string[] = ["todas"];
  if (d.etapa !== "encerrado" && (d.disputa_status || d.compensacao_status)) s.push("analise");
  if (d.resultado === "ganha" && d.credito_status === "aguardando") s.push("aguardando");
  if (d.credito_status === "nao_creditado") s.push("nao_creditado");
  if (d.credito_status === "creditado") s.push("creditadas");
  if (d.resultado === "perdida") {
    s.push("perdidas");
    if (d.plataforma_atualizado_em && agoraMs() - new Date(d.plataforma_atualizado_em).getTime() < 7 * 86400000) s.push("recorrer");
  }
  return s;
}

export default async function DisputasPage({ searchParams }: { searchParams: Promise<{ loja?: string; aba?: string; caso?: string }> }) {
  const params = await searchParams;
  const escopo = await escopoDoUsuario();
  const lojas = filtroLojas(escopo, params.loja);
  let q = supabase
    .from("devolucoes")
    .select("id, loja_id, canal, plataforma_id, pedido_id, motivo_codigo, motivo_texto, etapa, disputa_status, compensacao_status, resultado, valor_reembolso_pedido, valor_recuperado, credito_status, credito_esperado_ate, creditado_em, plataforma_criado_em, plataforma_atualizado_em, itens, lojas(apelido)")
    .or("disputa_status.not.is.null,compensacao_status.not.is.null,resultado.in.(ganha,perdida),credito_status.in.(aguardando,creditado,nao_creditado)")
    .order("plataforma_atualizado_em", { ascending: false })
    .limit(300);
  if (lojas) q = q.in("loja_id", lojas);
  const { data } = await q;
  const todas = ((data || []) as unknown) as D[];
  const aba = params.aba || "todas";
  const contagem: Record<string, number> = {};
  for (const d of todas) for (const k of classificar(d)) contagem[k] = (contagem[k] || 0) + 1;
  const lista = todas.filter((d) => classificar(d).includes(aba));
  const sel = todas.find((d) => d.id === params.caso) ?? lista[0] ?? null;

  const trinta = agoraMs() - 30 * 86400000;
  const decididas30 = todas.filter((d) => (d.resultado === "ganha" || d.resultado === "perdida") && d.plataforma_atualizado_em && new Date(d.plataforma_atualizado_em).getTime() > trinta);
  const ganhas30 = decididas30.filter((d) => d.resultado === "ganha").length;
  const recuperado = todas.filter((d) => d.resultado === "ganha").reduce((s, d) => s + Number(d.valor_recuperado ?? d.valor_reembolso_pedido ?? 0), 0);
  const creditado = todas.filter((d) => d.credito_status === "creditado").reduce((s, d) => s + Number(d.valor_recuperado ?? d.valor_reembolso_pedido ?? 0), 0);
  const naoCreditado = todas.filter((d) => d.credito_status === "nao_creditado");
  const vitoria = await taxaVitoria(lojas);
  const [{ data: eventosSel }, { data: midiasSel }] = sel ? await Promise.all([supabase.from("devolucao_eventos").select("quando, origem, descricao").eq("devolucao_id", sel.id).order("quando").limit(30), supabase.from("devolucao_midias").select("tipo, origem").eq("devolucao_id", sel.id)]) : [{ data: [] }, { data: [] }];
  const provas = (midiasSel || []).filter((m) => m.origem === "nos");
  const link = (a: string, caso?: string) => `/devolucoes/disputas?aba=${a}${caso ? `&caso=${caso}` : ""}${params.loja ? `&loja=${params.loja}` : ""}`;

  return (
    <>
      <Cabecalho ativa="disputas" titulo="Disputas e recuperação" descricao="O que foi contestado, o que ganhamos e se o dinheiro voltou de fato para a conta." />
      <div className="grid grid-cols-2 gap-3.5 md:grid-cols-5">
        <Kpi icone="auditoria" cor="indigo" rotulo="Disputas abertas" valor={contagem.analise || 0} detalhe="aguardando a plataforma" />
        <Kpi icone="insights" cor="verde" rotulo="Ganhas · 30 dias" valor={`${ganhas30} de ${decididas30.length}`} detalhe={decididas30.length ? `${Math.round((ganhas30 / decididas30.length) * 100)}% de acerto` : "sem decisões"} />
        <Kpi icone="financas" cor="roxo" rotulo="Valor recuperado" valor={brl(recuperado, 0)} detalhe="ganho nas decisões" />
        <Kpi icone="financas" cor="ceu" rotulo="Creditado na conta" valor={brl(creditado, 0)} detalhe="conferido na carteira e no extrato" />
        <Kpi icone="alertas" cor={naoCreditado.length ? "vermelho" : "indigo"} rotulo="Ganhou, não creditado" valor={brl(naoCreditado.reduce((s, d) => s + Number(d.valor_recuperado ?? d.valor_reembolso_pedido ?? 0), 0), 0)} detalhe={`${naoCreditado.length} caso(s) · cobrar`} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2" semPadding>
          <Tabs className="px-[18px]" abas={ABAS.map((a) => ({ id: a.id, nome: a.nome, contador: contagem[a.id] || 0, href: link(a.id) }))} ativa={aba} />
          {lista.length === 0 ? (
            <div className="p-[18px]">
              <Vazio titulo="Nenhuma disputa aqui" texto="Disputas aparecem quando um caso é contestado ou decidido." />
            </div>
          ) : (
            <Tabela>
              <thead>
                <tr>
                  <Th>Caso</Th>
                  <Th>Canal</Th>
                  <Th>Motivo</Th>
                  <Th>Aberta</Th>
                  <Th>Decisão</Th>
                  <Th numerica>Valor</Th>
                  <Th>Crédito na conta</Th>
                </tr>
              </thead>
              <tbody>
                {lista.map((d) => (
                  <Tr key={d.id} selecionada={sel?.id === d.id}>
                    <Td>
                      <Link href={link(aba, d.id)} className="font-medium text-texto hover:underline">
                        {d.itens?.[0]?.nome ?? d.pedido_id}
                      </Link>
                      <p className="text-xs text-texto-2">
                        {d.pedido_id} · {d.lojas?.apelido ?? ""}
                      </p>
                    </Td>
                    <Td>
                      <ChipCanal canal={d.canal} />
                    </Td>
                    <Td className="text-texto-2">{d.motivo_texto && d.motivo_texto !== d.motivo_codigo ? d.motivo_texto : d.motivo_codigo ?? "-"}</Td>
                    <Td className="text-texto-2">{fmtData(d.plataforma_criado_em)}</Td>
                    <Td>
                      <Chip cor={d.resultado === "ganha" ? "verde" : d.resultado === "perdida" ? "vermelho" : d.resultado === "parcial" ? "amarelo" : "cinza"}>{d.resultado ?? d.disputa_status ?? d.compensacao_status ?? "em análise"}</Chip>
                    </Td>
                    <Td numerica className="font-semibold">{brl(d.valor_recuperado ?? d.valor_reembolso_pedido)}</Td>
                    <Td>
                      {d.credito_status === "creditado" ? <Chip cor="verde">Creditado {fmtData(d.creditado_em)}</Chip> : d.credito_status === "nao_creditado" ? <Chip cor="vermelho">Não creditado</Chip> : d.credito_status === "aguardando" ? <Chip cor="amarelo">Aguardando · até {fmtData(d.credito_esperado_ate)}</Chip> : <span className="text-texto-2">—</span>}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Tabela>
          )}
        </Card>

        <div className="space-y-6">
          {sel && (
            <PainelDetalhe titulo={sel.itens?.[0]?.nome ?? sel.pedido_id} subtitulo={`${sel.plataforma_id} · ${brl(sel.valor_recuperado ?? sel.valor_reembolso_pedido)}`} acoes={<Link href={`/devolucoes/${sel.id}`} className="text-xs font-medium text-primaria hover:underline">Abrir caso</Link>}>
              <SecaoDetalhe titulo="Provas enviadas">
                <div className="flex flex-wrap gap-1.5">
                  {provas.length === 0 && <span className="text-xs text-texto-2">nenhuma prova nossa</span>}
                  {provas.some((p) => p.tipo === "video") && <Chip cor="azul">vídeo de abertura</Chip>}
                  {provas.some((p) => p.tipo === "quadro") && <Chip cor="azul">{provas.filter((p) => p.tipo === "quadro").length} quadros</Chip>}
                  {provas.some((p) => p.tipo === "foto") && <Chip cor="azul">{provas.filter((p) => p.tipo === "foto").length} fotos</Chip>}
                </div>
              </SecaoDetalhe>
              <SecaoDetalhe titulo="Linha do tempo">
                <ul className="space-y-1 text-xs text-texto">
                  {(eventosSel || []).map((e, i) => (
                    <li key={i}>
                      <span className="text-texto-2">{fmtData(e.quando)}</span> {e.descricao}
                    </li>
                  ))}
                </ul>
              </SecaoDetalhe>
              <SecaoDetalhe titulo="Crédito">
                <LinhaDetalhe rotulo="Situação" valor={sel.credito_status ?? "—"} destaque />
                <LinhaDetalhe rotulo="Esperado até" valor={fmtData(sel.credito_esperado_ate)} />
                {sel.credito_status === "nao_creditado" && <p className="mt-2 text-xs text-texto-2">Nenhum crédito ligado ao pedido {sel.pedido_id} apareceu na carteira desde a decisão.</p>}
                {(sel.credito_status === "nao_creditado" || sel.credito_status === "aguardando") && <MarcarCreditado id={sel.id} textoCobranca={textoCobranca(sel)} />}
              </SecaoDetalhe>
            </PainelDetalhe>
          )}
          <Card>
            <CardHeader titulo="O que funciona nas disputas" descricao="taxa de vitória por tipo de prova e por motivo" />
            {vitoria.porProva.length === 0 ? (
              <p className="text-[13px] text-texto-2">Ainda sem disputas decididas.</p>
            ) : (
              <div className="space-y-2">
                {vitoria.porProva.map((p) => (
                  <div key={p.chave}>
                    <div className="flex justify-between text-[13px]">
                      <span className="text-texto">{p.chave}</span>
                      <span className="text-texto-2">
                        {p.ganhas} de {p.total} · {p.pct}%
                      </span>
                    </div>
                    <Barra pct={p.pct} cor={p.pct >= 60 ? "bg-sucesso" : "bg-alerta"} />
                  </div>
                ))}
                <p className="pt-2 text-[11px] font-semibold uppercase tracking-wider text-texto-2">Por motivo</p>
                {vitoria.porMotivo.slice(0, 6).map((p) => (
                  <div key={p.chave} className="flex justify-between text-xs">
                    <span className="truncate text-texto">{p.chave}</span>
                    <span className="shrink-0 text-texto-2">
                      {p.ganhas}/{p.total} · {p.pct}%
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
