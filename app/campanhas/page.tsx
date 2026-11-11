import Link from "next/link";
import { escopoDoUsuario, filtroLojas } from "@/lib/conta";
import { supabase } from "@/lib/supabase";
import { brl, pct, data as fmtData, agoraMs } from "@/lib/formato";
import { urgencia } from "@/lib/devolucoes/pendencias";
import CampanhaForm from "./CampanhaForm";
import { Card, CardHeader, Chip, ChipCanal, ChipPrazo, Segmentado, Tabela, Th, Tr, Td, Vazio, PainelDetalhe, SecaoDetalhe, LinhaDetalhe, Aviso, BotaoLink } from "../components/ui";

export const dynamic = "force-dynamic";

type C = { id: string; canal: string; loja_id: string | null; nome: string; tipo: string; subtipo: string | null; inicio: string | null; fim: string | null; prazo_inscricao: string | null; desconto_min: number | null; estoque_min: number | null; exigencias: string | null; link: string | null; observacao: string | null; status: string | null; origem: string; lojas: { apelido: string } | null };
type I = { id: string; campanha_id: string; sku: string | null; item_id: string | null; nome: string | null; preco_normal: number | null; preco_campanha: number | null; estoque_promocao: number | null; status: string | null; motivo_recusa: string | null; margem: number | null; margem_pct: number | null; calculado_em: string | null };

const COR: Record<string, "laranja" | "tiktok" | "azul" | "roxo" | "vermelho"> = { shopee: "laranja", tiktok: "tiktok", propria: "azul", live: "roxo", prazo: "vermelho" };
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const diaBRT = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

export default async function CampanhasPage({ searchParams }: { searchParams: Promise<{ loja?: string; mes?: string; visao?: string; campanha?: string; nova?: string }> }) {
  const params = await searchParams;
  const escopo = await escopoDoUsuario();
  const lojas = filtroLojas(escopo, params.loja);
  const hoje = new Date(agoraMs());
  const [ano, mes] = (params.mes || `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`).split("-").map(Number);
  const iniMes = new Date(Date.UTC(ano, mes - 1, 1, 3));
  const fimMes = new Date(Date.UTC(ano, mes, 1, 3));
  let q = supabase.from("campanhas").select("id, canal, loja_id, nome, tipo, subtipo, inicio, fim, prazo_inscricao, desconto_min, estoque_min, exigencias, link, observacao, status, origem, lojas(apelido)").or(`inicio.lte.${new Date(fimMes.getTime() + 7 * 86400000).toISOString()},prazo_inscricao.lte.${fimMes.toISOString()}`).or(`fim.gte.${new Date(iniMes.getTime() - 7 * 86400000).toISOString()},fim.is.null`).order("inicio").limit(300);
  if (lojas) q = q.or(`loja_id.in.(${lojas.join(",")}),loja_id.is.null`);
  const [{ data: campsRaw }, { data: lojasInfo }] = await Promise.all([q, supabase.from("lojas").select("id, apelido").in("id", escopo.lojaIds.length ? escopo.lojaIds : ["00000000-0000-0000-0000-000000000000"])]);
  const camps = ((campsRaw || []) as unknown) as C[];
  const sel = camps.find((c) => c.id === params.campanha) ?? null;
  const { data: itensRaw } = sel ? await supabase.from("campanha_itens").select("*").eq("campanha_id", sel.id).order("margem", { ascending: true, nullsFirst: false }).limit(300) : { data: [] };
  const itens = ((itensRaw || []) as unknown) as I[];
  const negativos = itens.filter((i) => i.margem !== null && i.margem < 0).length;

  // calendário do mês: promoção que cobre o mês inteiro sai da grade (lista "Sempre ativas");
  // vários dias viram barra contínua com o nome só no primeiro dia de cada semana.
  const diaIniMes = `${ano}-${String(mes).padStart(2, "0")}-01`;
  const ultimoDia = new Date(ano, mes, 0).getDate();
  const diaFimMes = `${ano}-${String(mes).padStart(2, "0")}-${String(ultimoDia).padStart(2, "0")}`;
  const cobreMes = (c: C) => !!c.inicio && diaBRT(c.inicio) <= diaIniMes && (!c.fim || diaBRT(c.fim) >= diaFimMes);
  const sempreAtivas = camps.filter(cobreMes);
  const naGrade = camps.filter((c) => !cobreMes(c));
  const dias: { dia: Date; eventos: { nome: string; cor: "laranja" | "tiktok" | "azul" | "roxo" | "vermelho"; id: string; mostrarNome: boolean; continua: boolean }[] }[] = [];
  const primeiro = new Date(ano, mes - 1, 1);
  const inicioGrade = new Date(primeiro.getTime() - primeiro.getDay() * 86400000);
  for (let i = 0; i < 42; i++) {
    const d = new Date(inicioGrade.getTime() + i * 86400000);
    const chave = d.toLocaleDateString("en-CA");
    const eventos: (typeof dias)[number]["eventos"] = [];
    for (const c of naGrade) {
      const ini = c.inicio ? diaBRT(c.inicio) : null;
      const fim = c.fim ? diaBRT(c.fim) : ini;
      if (ini && fim && chave >= ini && chave <= fim) {
        const multi = ini !== fim;
        eventos.push({ nome: c.nome, cor: c.tipo === "live" ? "roxo" : c.tipo === "propria" ? "azul" : c.canal === "tiktok" ? "tiktok" : "laranja", id: c.id, mostrarNome: !multi || chave === ini || d.getDay() === 0, continua: multi });
      }
      if (c.prazo_inscricao && diaBRT(c.prazo_inscricao) === chave) eventos.push({ nome: `Prazo inscrição ${c.nome}`, cor: "vermelho", id: c.id, mostrarNome: true, continua: false });
    }
    dias.push({ dia: d, eventos });
  }
  const prazos = camps.filter((c) => c.prazo_inscricao && new Date(c.prazo_inscricao).getTime() >= agoraMs() - 86400000).sort((a, b) => a.prazo_inscricao!.localeCompare(b.prazo_inscricao!)).slice(0, 6);
  const mesAnt = `${mes === 1 ? ano - 1 : ano}-${String(mes === 1 ? 12 : mes - 1).padStart(2, "0")}`;
  const mesProx = `${mes === 12 ? ano + 1 : ano}-${String(mes === 12 ? 1 : mes + 1).padStart(2, "0")}`;
  const link = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ loja: params.loja, mes: params.mes, visao: params.visao, campanha: params.campanha, nova: params.nova, ...patch })) if (v) p.set(k, v);
    return `/campanhas?${p}`;
  };
  const visao = params.visao === "lista" ? "lista" : "mes";
  const lojasLista = (lojasInfo || []).map((l) => ({ id: l.id, apelido: l.apelido }));

  return (
    <div className="mx-auto max-w-[1400px] p-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold tracking-[-0.01em] text-texto">Calendário de campanhas</h1>
          <p className="mt-0.5 text-[13px] text-texto-2">Campanhas das plataformas, promoções próprias e prazos de inscrição</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Segmentado ativa={visao} opcoes={[{ id: "mes", nome: "Mês", href: link({ visao: undefined }) }, { id: "lista", nome: "Lista", href: link({ visao: "lista" }) }]} />
          {escopo.admin && <BotaoLink href={link({ nova: "1", campanha: undefined })} variante="principal">+ Nova campanha</BotaoLink>}
        </div>
      </div>

      {params.nova && escopo.admin && (
        <div className="mb-6">
          <CampanhaForm lojas={lojasLista} admin={escopo.admin} />
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2" semPadding>
          <div className="flex items-center justify-between px-[18px] pt-4">
            <Link href={link({ mes: mesAnt })} className="rounded-lg border border-borda px-2 py-1 text-[13px] text-texto hover:bg-superficie-2">‹</Link>
            <h2 className="text-[15px] font-semibold text-texto">
              {MESES[mes - 1].charAt(0).toUpperCase() + MESES[mes - 1].slice(1)} de {ano}
            </h2>
            <Link href={link({ mes: mesProx })} className="rounded-lg border border-borda px-2 py-1 text-[13px] text-texto hover:bg-superficie-2">›</Link>
          </div>
          <div className="flex flex-wrap gap-2 px-[18px] py-2 text-xs">
            <Chip cor="laranja">Shopee</Chip>
            <Chip cor="tiktok">TikTok</Chip>
            <Chip cor="azul">Promoção própria</Chip>
            <Chip cor="roxo">Live</Chip>
            <Chip cor="vermelho">Prazo</Chip>
          </div>
          {visao === "mes" ? (
            <div className="grid grid-cols-7 gap-px border-t border-borda bg-linha">
              {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((d) => (
                <div key={d} className="bg-superficie-2 px-2 py-1 text-[11px] font-semibold uppercase text-texto-2">
                  {d}
                </div>
              ))}
              {dias.map(({ dia, eventos }, i) => {
                const foraDoMes = dia.getMonth() !== mes - 1;
                const ehHoje = dia.toLocaleDateString("en-CA") === hoje.toLocaleDateString("en-CA");
                return (
                  <div key={i} className={`min-h-[84px] bg-superficie p-1.5 ${foraDoMes ? "opacity-40" : ""}`}>
                    <div className={`mb-1 text-xs ${ehHoje ? "font-bold text-primaria" : "text-texto-2"}`}>{dia.getDate()}</div>
                    {eventos.slice(0, 4).map((e, j) => (
                      <Link key={j} href={link({ campanha: e.id })} className="block truncate" title={e.nome}>
                        <Chip cor={e.cor} className={`mb-0.5 block max-w-full truncate !px-1.5 !py-0 text-[10px] ${e.continua ? "!rounded-none -mx-1.5" : ""}`}>{e.mostrarNome ? e.nome : "\u00a0"}</Chip>
                      </Link>
                    ))}
                    {eventos.length > 4 && <p className="text-[10px] text-texto-2">+{eventos.length - 4}</p>}
                  </div>
                );
              })}
            </div>
          ) : (
            <Tabela>
              <thead>
                <tr>
                  <Th>Campanha</Th>
                  <Th>Canal</Th>
                  <Th>Tipo</Th>
                  <Th>Início</Th>
                  <Th>Fim</Th>
                  <Th>Inscrição até</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {camps.length === 0 && (
                  <Tr>
                    <Td colSpan={7} className="text-texto-2">Nenhuma campanha neste mês.</Td>
                  </Tr>
                )}
                {camps.map((c) => (
                  <Tr key={c.id} selecionada={sel?.id === c.id}>
                    <Td>
                      <Link href={link({ campanha: c.id })} className="font-medium text-texto hover:underline">
                        {c.nome}
                      </Link>
                      <p className="text-xs text-texto-2">{c.lojas?.apelido ?? "todas as lojas"}{c.subtipo ? ` · ${c.subtipo}` : ""}</p>
                    </Td>
                    <Td>{c.canal === "ambos" ? <Chip cor="cinza">ambos</Chip> : <ChipCanal canal={c.canal} />}</Td>
                    <Td>
                      <Chip cor={COR[c.tipo] ?? "cinza"}>{c.tipo}</Chip>
                    </Td>
                    <Td>{fmtData(c.inicio, true)}</Td>
                    <Td>{fmtData(c.fim, true)}</Td>
                    <Td>{c.prazo_inscricao ? <ChipPrazo urgencia={urgencia(c.prazo_inscricao)}>{fmtData(c.prazo_inscricao, true)}</ChipPrazo> : "—"}</Td>
                    <Td className="text-texto-2">{c.status ?? c.origem}</Td>
                  </Tr>
                ))}
              </tbody>
            </Tabela>
          )}
        </Card>

        <div className="space-y-6">
          {sempreAtivas.length > 0 && (
            <Card>
              <CardHeader titulo="Sempre ativas" descricao="promoções que cobrem o mês inteiro (fora da grade)" />
              <ul className="divide-y divide-linha">
                {sempreAtivas.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-2 py-2 text-[13px]">
                    <Link href={link({ campanha: c.id })} className="min-w-0 truncate text-texto hover:underline" title={c.nome}>
                      {c.nome}
                    </Link>
                    <span className="shrink-0 text-xs text-texto-2">{c.canal === "ambos" ? "ambos" : c.canal} · até {c.fim ? fmtData(c.fim) : "—"}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          <Card>
            <CardHeader titulo="Próximos prazos" />
            {prazos.length === 0 ? (
              <p className="text-[13px] text-texto-2">Nenhum prazo de inscrição cadastrado.</p>
            ) : (
              <ul className="divide-y divide-linha">
                {prazos.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-2 py-2 text-[13px]">
                    <Link href={link({ campanha: c.id })} className="min-w-0 truncate text-texto hover:underline">
                      Inscrição {c.nome}
                    </Link>
                    <ChipPrazo urgencia={urgencia(c.prazo_inscricao)}>{fmtData(c.prazo_inscricao)}</ChipPrazo>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {sel && (
            <PainelDetalhe titulo={sel.nome} subtitulo={`${fmtData(sel.inicio)}${sel.fim ? ` a ${fmtData(sel.fim)}` : ""} · ${sel.lojas?.apelido ?? "todas"}`} acoes={sel.link ? <a href={sel.link} target="_blank" rel="noreferrer" className="text-xs font-medium text-primaria hover:underline">Abrir no Seller Center</a> : undefined}>
              <SecaoDetalhe titulo="Campanha">
                <LinhaDetalhe rotulo="Tipo" valor={`${sel.tipo}${sel.subtipo ? ` · ${sel.subtipo}` : ""}`} />
                <LinhaDetalhe rotulo="Itens inscritos" valor={String(itens.length)} destaque />
                {sel.desconto_min != null && <LinhaDetalhe rotulo="Desconto mínimo" valor={pct(sel.desconto_min, 0)} />}
                {sel.estoque_min != null && <LinhaDetalhe rotulo="Estoque mínimo" valor={String(sel.estoque_min)} />}
                {sel.exigencias && <p className="mt-1 text-xs text-texto-2">{sel.exigencias}</p>}
              </SecaoDetalhe>
              <SecaoDetalhe titulo="Margem com o preço da campanha">
                {itens.length === 0 ? (
                  <p className="text-xs text-texto-2">Sem itens. Inscreva pelo formulário ou aguarde a coleta das promoções próprias.</p>
                ) : (
                  itens.slice(0, 30).map((i) => (
                    <div key={i.id} className="flex items-center justify-between gap-2 border-b border-linha py-1.5 text-[13px] last:border-0">
                      <span className="min-w-0 truncate text-texto">
                        {i.nome ?? i.sku ?? i.item_id}
                        <span className="text-texto-2">
                          {" "}
                          {i.preco_normal ? `${brl(i.preco_normal)} → ` : ""}
                          {brl(i.preco_campanha)}
                        </span>
                      </span>
                      {i.margem === null ? <Chip cor="cinza">sem custo</Chip> : <Chip cor={i.margem < 0 ? "vermelho" : (i.margem_pct ?? 0) < 10 ? "amarelo" : "verde"}>{pct(i.margem_pct ?? 0)}</Chip>}
                    </div>
                  ))
                )}
                {negativos > 0 && <Aviso className="mt-2">{negativos} item(ns) ficam com margem negativa no preço exigido. Revise antes de confirmar.</Aviso>}
                {itens[0]?.calculado_em && <p className="mt-1 text-[11px] text-texto-2">calculado {fmtData(itens[0].calculado_em, true)}</p>}
              </SecaoDetalhe>
              {escopo.admin && <CampanhaForm lojas={lojasLista} admin={escopo.admin} campanha={{ ...sel }} />}
            </PainelDetalhe>
          )}
        </div>
      </div>
    </div>
  );
}
