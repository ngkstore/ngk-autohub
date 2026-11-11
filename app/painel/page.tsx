import Link from "next/link";
import { escopoDoUsuario, filtroLojas } from "@/lib/conta";
import { montarPainel, type Pendencia, type Urgencia } from "@/lib/painel/pendencias";
import { prazoRelativo, data as fmtData } from "@/lib/formato";
import PainelAcoes from "./PainelAcoes";
import { Card, CardHeader, Kpi, Chip, ChipCanal, ChipPrazo, BotaoLink, Vazio, LinhaDetalhe } from "../components/ui";

export const dynamic = "force-dynamic";

const GRUPOS: { id: Urgencia; nome: string; sub: string }[] = [
  { id: "agora", nome: "Agora", sub: "vencido ou vence em até 4 h" },
  { id: "hoje", nome: "Hoje", sub: "até 23:59" },
  { id: "amanha", nome: "Amanhã", sub: "" },
  { id: "depois", nome: "Depois", sub: "" },
];

function Linha({ p }: { p: Pendencia }) {
  return (
    <li className="flex items-center gap-3 border-t border-linha py-2.5 text-[13px]">
      <div className="w-24 shrink-0">{p.prazo ? <ChipPrazo urgencia={p.urgencia}>{p.urgencia === "agora" && new Date(p.prazo) < new Date() ? `vencido ${prazoRelativo(p.prazo).replace("vencida ", "")}` : prazoRelativo(p.prazo)}</ChipPrazo> : <Chip cor="cinza">sem prazo</Chip>}</div>
      <div className="w-16 shrink-0">
        <ChipCanal canal={p.canal} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-texto">{p.titulo}</p>
        <p className="truncate text-xs text-texto-2">{p.detalhe}</p>
      </div>
      <Link href={p.link} className="shrink-0 rounded-[9px] border border-borda px-3 py-1.5 text-xs font-medium text-texto hover:bg-superficie-2">
        {p.acao}
      </Link>
    </li>
  );
}

export default async function PainelPage({ searchParams }: { searchParams: Promise<{ loja?: string }> }) {
  const params = await searchParams;
  const escopo = await escopoDoUsuario();
  const lojas = filtroLojas(escopo, params.loja);
  const p = await montarPainel(lojas);
  const hoje = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="mx-auto max-w-[1400px] p-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold tracking-[-0.01em] text-texto">Painel do dia</h1>
          <p className="mt-0.5 text-[13px] capitalize text-texto-2">{hoje} · tudo que tem prazo, do mais urgente ao menos</p>
        </div>
        <PainelAcoes admin={escopo.admin} />
      </div>

      <div className="grid grid-cols-2 gap-3.5 md:grid-cols-4">
        <Kpi icone="alertas" cor={p.contagem.agora ? "vermelho" : "verde"} rotulo="Agora · vencido ou até 4 h" valor={p.contagem.agora} detalhe={`${p.pendencias.filter((x) => x.urgencia === "agora" && /atrasad|punição|métrica/i.test(x.titulo)).length} podem gerar ponto de penalidade`} />
        <Kpi icone="painel" cor="laranja" rotulo="Hoje · até 23:59" valor={p.contagem.hoje} detalhe={`${p.pendencias.filter((x) => x.urgencia === "hoje" && /postar/.test(x.titulo)).length} grupo(s) de pedidos a postar`} />
        <Kpi icone="campanhas" cor="amarelo" rotulo="Amanhã" valor={p.contagem.amanha} detalhe={p.contagem.depois ? `+${p.contagem.depois} depois` : ""} />
        <Kpi icone="auditoria" cor="verde" rotulo="Resolvidos hoje" valor={p.resolvidosHoje} detalhe={`ontem: ${p.resolvidosOntem}`} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          {p.pendencias.length === 0 && <Vazio titulo="Nada pendente" texto="Nenhum prazo em aberto nas lojas selecionadas." />}
          {GRUPOS.map((g) => {
            const itens = p.pendencias.filter((x) => x.urgencia === g.id);
            if (itens.length === 0) return null;
            return (
              <Card key={g.id}>
                <CardHeader titulo={g.nome} descricao={g.sub} acoes={<Chip cor={g.id === "agora" ? "vermelho" : g.id === "hoje" ? "laranja" : g.id === "amanha" ? "amarelo" : "cinza"}>{itens.length} ite{itens.length === 1 ? "m" : "ns"}</Chip>} />
                <ul>
                  {itens.map((x, i) => (
                    <Linha key={`${x.link}-${i}`} p={x} />
                  ))}
                </ul>
              </Card>
            );
          })}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader titulo="Saúde das contas" acoes={<BotaoLink href="/saude" pequeno>Detalhes</BotaoLink>} />
            {p.saude.length === 0 ? (
              <p className="text-[13px] text-texto-2">Sem coleta de saúde ainda.</p>
            ) : (
              <div className="space-y-3">
                {p.saude.map((s) => (
                  <div key={s.loja_id} className="border-t border-linha pt-2 first:border-0 first:pt-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2 text-[13px] font-medium text-texto">
                        <ChipCanal canal={s.canal} /> {s.nome}
                      </span>
                      <Chip cor={s.punicoes ? "vermelho" : s.metricas_fora ? "amarelo" : "verde"}>{s.punicoes ? "Punição" : s.metricas_fora ? "Atenção" : s.rating || "Bom"}</Chip>
                    </div>
                    {s.fora.slice(0, 3).map((f, i) => (
                      <LinhaDetalhe key={i} rotulo={f.nome} valor={`${f.atual ?? "-"} / meta ${f.alvo ?? "-"}`} />
                    ))}
                    {s.pontos > 0 && <LinhaDetalhe rotulo="Pontos de penalidade" valor={String(s.pontos)} />}
                    <p className="text-[11px] text-texto-2">coleta {fmtData(s.dia)}</p>
                  </div>
                ))}
              </div>
            )}
          </Card>
          <Card>
            <CardHeader titulo="Conferências financeiras" acoes={<BotaoLink href="/financas?aba=custos" pequeno>Finanças</BotaoLink>} />
            {p.conferencias.map((c) => (
              <div key={c.nome} className="flex items-center justify-between gap-2 border-b border-linha py-1.5 text-[13px] last:border-0">
                <span className="text-texto">{c.nome}</span>
                <Chip cor={c.ok ? "verde" : "vermelho"}>{c.texto}</Chip>
              </div>
            ))}
          </Card>
          <Card>
            <CardHeader titulo="Integrações" acoes={<BotaoLink href="/integracoes" pequeno>Integrações</BotaoLink>} />
            {p.integracoes.map((i) => (
              <div key={i.nome} className="flex items-center justify-between gap-2 border-b border-linha py-1.5 text-[13px] last:border-0">
                <span className="truncate text-texto">{i.nome}</span>
                <Chip cor={i.ok ? "verde" : "vermelho"}>{i.texto}</Chip>
              </div>
            ))}
            <p className="mt-2 text-[11px] text-texto-2">Resumo no Telegram às 08:00 e 14:00.</p>
          </Card>
        </div>
      </div>
    </div>
  );
}
