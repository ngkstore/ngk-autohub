import Link from "next/link";
import { escopoDoUsuario, filtroLojas } from "@/lib/conta";
import { supabase } from "@/lib/supabase";
import { montarEstoque, type LinhaEstoque } from "@/lib/estoque/consultas";
import { brl, numero, data as fmtData } from "@/lib/formato";
import EstoqueCadastros from "./EstoqueCadastros";
import PedidoCompra from "./PedidoCompra";
import { Card, CardHeader, Kpi, Chip, Tabs, Tabela, Th, Tr, Td, Produto, Segmentado, Vazio, PainelDetalhe, SecaoDetalhe, LinhaDetalhe, Aviso, Dica } from "../components/ui";

export const dynamic = "force-dynamic";

const STATUS: { id: string; nome: string; cor: "vermelho" | "laranja" | "amarelo" | "verde" | "roxo" | "cinza" }[] = [
  { id: "ruptura", nome: "Ruptura", cor: "vermelho" },
  { id: "critico", nome: "Crítico", cor: "laranja" },
  { id: "atencao", nome: "Atenção", cor: "amarelo" },
  { id: "ok", nome: "OK", cor: "verde" },
  { id: "excesso", nome: "Excesso", cor: "roxo" },
  { id: "parado", nome: "Parado 30 d", cor: "cinza" },
  { id: "inativo", nome: "Sem estoque, inativo", cor: "cinza" },
  { id: "mapear", nome: "Sem mapeamento", cor: "amarelo" },
];
const corStatus = (s: string) => STATUS.find((x) => x.id === s)?.cor ?? "cinza";

export default async function EstoquePage({ searchParams }: { searchParams: Promise<{ loja?: string; aba?: string; status?: string; fornecedor?: string; ordem?: string; q?: string; sku?: string }> }) {
  const params = await searchParams;
  const escopo = await escopoDoUsuario();
  const lojas = filtroLojas(escopo, params.loja);
  const aba = params.aba || "estoque";
  const [{ linhas, temUpseller, coletadoEm, fatorAtual, dataMaisAntiga }, { data: fornecedores }, { data: fatores }, { data: compras }, { data: mapeamento }] = await Promise.all([
    montarEstoque(lojas, escopo.lojaIds.length ? escopo.lojaIds : lojas),
    supabase.from("fornecedores").select("id, nome, prazo_dias, seguranca_dias, caixa_padrao, observacao, ativo").order("nome"),
    supabase.from("estoque_fator_sazonal").select("id, nome, inicio, fim, fator").order("inicio"),
    supabase.from("compras_a_caminho").select("id, sku, quantidade, previsao, fornecedor_id, observacao").eq("recebido", false).order("previsao"),
    aba === "mapeamento" ? supabase.from("catalogo_mapeamento").select("canal, loja_id, item_id, model_id, sku_anuncio, sku_armazem, anormal, origem, nome_produto, lojas(apelido)").order("anormal", { ascending: false }).order("atualizado_em", { ascending: false }).limit(2000) : Promise.resolve({ data: [] }),
  ]);

  const contagem: Record<string, number> = { todos: linhas.length };
  for (const l of linhas) contagem[l.status] = (contagem[l.status] || 0) + 1;
  let lista = linhas;
  if (params.status && params.status !== "todos") lista = lista.filter((l) => l.status === params.status);
  if (params.fornecedor) lista = lista.filter((l) => l.fornecedorId === params.fornecedor);
  if (params.q) {
    const q = params.q.toLowerCase();
    lista = lista.filter((l) => l.sku.toLowerCase().includes(q) || (l.nome || "").toLowerCase().includes(q));
  }
  if (params.ordem === "venda") lista = [...lista].sort((a, b) => b.vendaDia - a.vendaDia);
  else if (params.ordem === "parado") lista = [...lista].sort((a, b) => b.valorParado - a.valorParado);
  const sel = linhas.find((l) => l.sku === params.sku) ?? lista[0] ?? null;
  const link = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ aba, status: params.status, fornecedor: params.fornecedor, ordem: params.ordem, q: params.q, loja: params.loja, sku: params.sku, ...patch })) if (v) p.set(k, v);
    return `/estoque?${p}`;
  };
  const excesso = linhas.filter((l) => l.status === "excesso").reduce((s, l) => s + l.valorParado, 0);
  const aCaminho = (compras || []).reduce((s, c) => s + Number(c.quantidade || 0), 0);
  const proxima = (compras || []).find((c) => c.previsao)?.previsao as string | undefined;
  const sugestoes = linhas.filter((l) => l.comprar > 0).map((l) => ({ sku: l.sku, nome: l.nome, fornecedor: l.fornecedor, quantidade: l.comprar, caixa: l.caixa, custo: l.custo }));
  // SKUs de anúncio que venderam nos últimos 30 d e não chegam a um SKU do armazém (nem por item/variação, nem por SKU)
  type SemMapa = { loja_id: string; item_id: string | null; model_id: string; model_sku: string; variacao: string | null; qtd: number; por_dia: number };
  let anunciosSemMapa: SemMapa[] = [];
  if (aba === "mapeamento") {
    const { data: sm } = await supabase.rpc("anuncios_sem_mapeamento", { p_dias: 30, p_loja_ids: lojas });
    anunciosSemMapa = ((sm as SemMapa[]) || []).sort((a, b) => Number(b.qtd) - Number(a.qtd));
  }
  const nomeLoja = new Map<string, string>();
  for (const m of mapeamento || []) nomeLoja.set(m.loja_id, (m.lojas as unknown as { apelido: string } | null)?.apelido ?? m.canal);

  return (
    <div className="mx-auto max-w-[1400px] p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold tracking-[-0.01em] text-texto">Estoque e ruptura</h1>
          <p className="mt-0.5 text-[13px] text-texto-2">Estoque físico único (UpSeller), dividido entre Shopee e TikTok, com previsão de quando cada item acaba.</p>
        </div>
        <PedidoCompra sugestoes={sugestoes} temUpseller={temUpseller} />
      </div>
      <Tabs className="mb-5" ativa={aba} abas={[{ id: "estoque", nome: "Estoque", href: link({ aba: "estoque" }) }, { id: "mapeamento", nome: "Mapeamento", href: link({ aba: "mapeamento" }) }, { id: "fornecedores", nome: "Fornecedores e prazos", href: link({ aba: "fornecedores" }) }, { id: "importar", nome: "Importar", href: link({ aba: "importar" }) }]} />

      {!temUpseller && <Aviso className="mb-4">Sem coleta do UpSeller ainda. Gere o token em UpSeller → Plataforma Aberta → API/MCP e crie <code>UPSELLER_MCP_TOKEN</code> na Vercel (ou importe as planilhas na aba Importar). Enquanto isso a tabela mostra só as vendas por SKU.</Aviso>}
      {dataMaisAntiga && <p className="mb-3 text-[11px] text-texto-2">Pedido mais antigo com itens: {fmtData(dataMaisAntiga)} {fatorAtual !== 1 ? `· fator sazonal em vigor ${fatorAtual}×` : ""} {coletadoEm ? `· estoque coletado ${fmtData(coletadoEm, true)}` : ""}</p>}

      {aba === "estoque" && (
        <>
          <div className="grid grid-cols-2 gap-3.5 md:grid-cols-5">
            <Kpi icone="alertas" cor="vermelho" rotulo="Em ruptura" valor={contagem.ruptura || 0} detalhe="com venda nos últimos 30 dias" />
            <Kpi icone="estoque" cor="laranja" rotulo="Críticos" valor={contagem.critico || 0} detalhe="acabam antes da reposição" />
            <Kpi icone="painel" cor="amarelo" rotulo="Atenção" valor={contagem.atencao || 0} detalhe="abaixo do ponto de pedido" />
            <Kpi icone="financas" cor="roxo" rotulo="Capital em excesso" valor={brl(excesso, 0)} detalhe="mais de 90 dias de estoque" />
            <Kpi icone="pedidos" cor="ceu" rotulo="A caminho" valor={`${numero(aCaminho)} un.`} detalhe={proxima ? `chega ${fmtData(proxima)}` : "nada lançado"} />
          </div>
          <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
            <Card className="xl:col-span-2" semPadding>
              <Tabs className="px-[18px]" ativa={params.status || "todos"} abas={[{ id: "todos", nome: "Todos", contador: contagem.todos, href: link({ status: undefined }) }, ...STATUS.map((s) => ({ id: s.id, nome: s.nome, contador: contagem[s.id] || 0, href: link({ status: s.id }) }))]} />
              <div className="flex flex-wrap items-center gap-2 px-[18px] py-3">
                <Segmentado rotulo="Fornecedor" ativa={params.fornecedor || "todos"} opcoes={[{ id: "todos", nome: "Todos os fornecedores", href: link({ fornecedor: undefined }) }, ...(fornecedores || []).map((f) => ({ id: f.id, nome: f.nome, href: link({ fornecedor: f.id }) }))]} />
                <Segmentado rotulo="Ordenar" ativa={params.ordem || "cobertura"} opcoes={[{ id: "cobertura", nome: "Por cobertura", href: link({ ordem: undefined }) }, { id: "venda", nome: "Por venda", href: link({ ordem: "venda" }) }, { id: "parado", nome: "Por valor parado", href: link({ ordem: "parado" }) }]} />
                <form className="ml-auto" action="/estoque">
                  <input type="hidden" name="aba" value="estoque" />
                  <input name="q" defaultValue={params.q || ""} placeholder="Buscar SKU ou nome" className="h-8 w-48 rounded-lg border border-borda bg-superficie px-2 text-[13px] text-texto" />
                </form>
              </div>
              {lista.length === 0 ? (
                <div className="p-[18px]">
                  <Vazio titulo="Nada aqui" texto="Nenhum SKU com os filtros escolhidos." />
                </div>
              ) : (
                <Tabela>
                  <thead>
                    <tr>
                      <Th>Produto</Th>
                      <Th numerica>Físico</Th>
                      <Th numerica>Shopee</Th>
                      <Th numerica>TikTok</Th>
                      <Th numerica>Venda/dia</Th>
                      <Th numerica>Cobertura</Th>
                      <Th numerica>Ponto de pedido</Th>
                      <Th numerica>Comprar</Th>
                      <Th>Status</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {lista.slice(0, 300).map((l) => (
                      <Tr key={l.sku} selecionada={sel?.sku === l.sku}>
                        <Td>
                          <Link href={link({ sku: l.sku })} className="block">
                            <Produto nome={l.nome ?? l.sku} sku={l.sku} extra={l.tipo === "kit" ? "kit" : l.fornecedor ?? undefined} />
                          </Link>
                        </Td>
                        <Td numerica>{temUpseller ? numero(l.fisico) : "—"}</Td>
                        <Td numerica>{l.shopee === null ? "—" : numero(l.shopee)}</Td>
                        <Td numerica>—</Td>
                        <Td numerica>{numero(l.vendaDia, 1)}</Td>
                        <Td numerica>{l.cobertura === null ? (l.v30 > 0 ? "—" : "sem venda") : `${numero(l.cobertura, 0)} d`}</Td>
                        <Td numerica>{numero(l.pontoPedido)}</Td>
                        <Td numerica className="font-semibold">{l.comprar ? numero(l.comprar) : "—"}</Td>
                        <Td>
                          <Chip cor={corStatus(l.status)}>{STATUS.find((s) => s.id === l.status)?.nome}</Chip>
                        </Td>
                      </Tr>
                    ))}
                  </tbody>
                </Tabela>
              )}
            </Card>
            <div>
              {sel ? (
                <PainelDetalhe titulo={sel.nome ?? sel.sku} subtitulo={`${sel.sku}${sel.fornecedor ? ` · ${sel.fornecedor}` : ""}`} acoes={<Chip cor={corStatus(sel.status)}>{STATUS.find((s) => s.id === sel.status)?.nome}</Chip>}>
                  <SecaoDetalhe titulo="Projeção do estoque">
                    <LinhaDetalhe rotulo="Acaba em" valor={sel.acabaEm ? fmtData(sel.acabaEm) : "sem venda"} destaque />
                    <LinhaDetalhe rotulo="Venda média por dia" valor={numero(sel.vendaDia, 1)} />
                    <LinhaDetalhe rotulo="Vendas 7 d / 28 d" valor={`${numero(sel.v7)} / ${numero(sel.v28)}`} />
                    <LinhaDetalhe rotulo="Prazo de reposição" valor={`${sel.prazoDias} dias`} />
                    <LinhaDetalhe rotulo="Estoque de segurança" valor={`${sel.segurancaDias} dias`} />
                    <LinhaDetalhe rotulo="Em trânsito" valor={numero(sel.emTransito)} />
                    <LinhaDetalhe rotulo="Venda perdida estimada" valor={brl(sel.vendaPerdida, 0)} />
                    <LinhaDetalhe rotulo="Compra sugerida" valor={sel.comprar ? `${numero(sel.comprar)} un.${sel.caixa ? ` (${Math.ceil(sel.comprar / sel.caixa)} caixas)` : ""}` : "—"} destaque />
                  </SecaoDetalhe>
                  {sel.componentes && (
                    <SecaoDetalhe titulo="Componentes do kit">
                      {sel.componentes.map((c) => (
                        <LinhaDetalhe key={c.sku} rotulo={`${c.quantidade}× ${c.sku}`} valor={`${numero(c.disponivel)} disp.`} />
                      ))}
                    </SecaoDetalhe>
                  )}
                  {sel.kitsAfetados.length > 0 && <Dica>Entra nos kits: {sel.kitsAfetados.join(", ")}. Ruptura aqui para os kits.</Dica>}
                  {fatorAtual !== 1 && <Dica className="mt-2">Fator sazonal {fatorAtual}× em vigor: a média já considera a alta do período.</Dica>}
                  <p className="mt-3 text-[11px] text-texto-2">Venda média = 50% dos últimos 7 dias + 30% dos últimos 28 + 20% do mesmo período do ano anterior (sem ano anterior: 60/40 × fator sazonal).</p>
                </PainelDetalhe>
              ) : (
                <Card>
                  <p className="text-[13px] text-texto-2">Escolha um SKU para ver a projeção.</p>
                </Card>
              )}
            </div>
          </div>
        </>
      )}

      {aba === "mapeamento" && (
        <Card semPadding>
          <CardHeader className="px-[18px] pt-4" titulo="Mapeamento anúncio → SKU do armazém" descricao={`${(mapeamento || []).length} mapeados (${(mapeamento || []).filter((m) => m.origem === "upseller").length} vindos do UpSeller) · ${anunciosSemMapa.length} SKUs de anúncio vendidos em 30 d sem ligação com o armazém: não contam como ruptura até serem mapeados no UpSeller (Produtos > Gerenciar Mapeamento) ou importados por planilha`} />
          {anunciosSemMapa.length > 0 && (
            <div className="px-[18px] pb-4">
              <p className="mb-2 text-[13px] font-semibold text-texto">Sem mapeamento (vendidos em 30 d)</p>
              <Tabela>
                <thead>
                  <tr>
                    <Th>Loja</Th>
                    <Th>Item / variação</Th>
                    <Th>SKU do anúncio</Th>
                    <Th numerica>Un. 30 d</Th>
                    <Th numerica>Un./dia</Th>
                  </tr>
                </thead>
                <tbody>
                  {anunciosSemMapa.slice(0, 200).map((a, i) => (
                    <Tr key={i}>
                      <Td>{nomeLoja.get(a.loja_id) ?? a.loja_id.slice(0, 8)}</Td>
                      <Td className="text-xs text-texto-2">{a.item_id}{a.model_id ? ` / ${a.model_id}` : ""}{a.variacao ? ` · ${a.variacao}` : ""}</Td>
                      <Td>{a.model_sku}</Td>
                      <Td numerica>{Number(a.qtd).toLocaleString("pt-BR")}</Td>
                      <Td numerica className="font-semibold">{Number(a.por_dia).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}</Td>
                    </Tr>
                  ))}
                </tbody>
              </Tabela>
            </div>
          )}
          <Tabela>
            <thead>
              <tr>
                <Th>Loja</Th>
                <Th>Item / variação</Th>
                <Th>SKU do anúncio</Th>
                <Th>SKU do armazém</Th>
                <Th>Origem</Th>
              </tr>
            </thead>
            <tbody>
              {(mapeamento || []).slice(0, 500).map((m, i) => (
                <Tr key={i}>
                  <Td>{(m.lojas as unknown as { apelido: string } | null)?.apelido ?? m.canal}</Td>
                  <Td className="text-xs text-texto-2">{m.item_id}{m.model_id ? ` / ${m.model_id}` : ""}</Td>
                  <Td>{m.sku_anuncio ?? <span className="text-texto-2">—</span>}</Td>
                  <Td>{m.sku_armazem}</Td>
                  <Td>{m.anormal ? <Chip cor="vermelho">anormal</Chip> : <Chip cor={m.origem === "upseller" ? "azul" : "verde"}>{m.origem === "upseller" ? "UpSeller" : "planilha"}</Chip>}</Td>
                </Tr>
              ))}
            </tbody>
          </Tabela>
        </Card>
      )}

      {(aba === "fornecedores" || aba === "importar") && <EstoqueCadastros aba={aba} fornecedores={fornecedores || []} fatores={(fatores || []) as { id: string; nome: string; inicio: string; fim: string; fator: number }[]} compras={(compras || []) as { id: string; sku: string; quantidade: number; previsao: string | null; fornecedor_id: string | null; observacao: string | null }[]} admin={escopo.admin} lojas={(escopo.lojaIds || []).map((id) => ({ id }))} />}
    </div>
  );
}
