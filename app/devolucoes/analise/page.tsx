import { escopoDoUsuario, filtroLojas } from "@/lib/conta";
import { supabase } from "@/lib/supabase";
import { brl, pct, agoraMs } from "@/lib/formato";
import Cabecalho from "../Cabecalho";
import { Card, CardHeader, Kpi, Chip, ChipCanal, Tabela, Th, Tr, Td, Barra, Dica } from "../../components/ui";

export const dynamic = "force-dynamic";

type D = { loja_id: string; canal: string; tipo: string; motivo_codigo: string | null; motivo_texto: string | null; resultado: string | null; valor_reembolsado: number | null; valor_reembolso_pedido: number | null; valor_recuperado: number | null; etapa: string; itens: { sku: string | null; nome: string | null; quantidade: number; valor: number | null }[] | null; plataforma_criado_em: string | null; prazo_resposta: string | null; lojas: { apelido: string } | null };

const GRUPOS: { nome: string; casa: (m: string) => boolean; acao: string }[] = [
  { nome: "Diferente do anúncio", casa: (m) => /NOT_MATCH|DIFFERENT|not_match|WRONG_ITEM|WRONG/i.test(m), acao: "Revisar fotos, medidas e descrição no anúncio" },
  { nome: "Produto com defeito", casa: (m) => /FUNCTIONAL|DEFECT|defective|NOT_WORK/i.test(m), acao: "Abrir garantia com o fornecedor e conferir lote" },
  { nome: "Chegou danificado", casa: (m) => /DAMAGE|damaged|BROKEN/i.test(m), acao: "Reforçar a caixa e o seguro de transporte" },
  { nome: "Arrependimento", casa: (m) => /CHANGE_OF_MIND|change_mind|NO_LONGER|DONT_WANT/i.test(m), acao: "Nada a corrigir no produto; acompanhar o custo" },
  { nome: "Faltando peça", casa: (m) => /MISSING|missing|INCOMPLETE|LACK/i.test(m), acao: "Conferir itens e parafusos na expedição" },
  { nome: "Não recebido", casa: (m) => /NOT_RECEIVED|not_received|NON_RECEIPT/i.test(m), acao: "Guardar foto de entrega e disputar com comprovante" },
];
const grupoDe = (d: D) => GRUPOS.find((g) => g.casa(`${d.motivo_codigo ?? ""} ${d.motivo_texto ?? ""}`))?.nome ?? "Outros";

export default async function AnalisePage({ searchParams }: { searchParams: Promise<{ loja?: string }> }) {
  const params = await searchParams;
  const escopo = await escopoDoUsuario();
  const lojas = filtroLojas(escopo, params.loja);
  const desde = new Date(agoraMs() - 30 * 86400000).toISOString();
  let q = supabase.from("devolucoes").select("loja_id, canal, tipo, motivo_codigo, motivo_texto, resultado, valor_reembolsado, valor_reembolso_pedido, valor_recuperado, etapa, itens, plataforma_criado_em, prazo_resposta, lojas(apelido)").gte("plataforma_criado_em", desde).neq("tipo", "cancelamento").limit(5000);
  if (lojas) q = q.in("loja_id", lojas);
  const { data } = await q;
  const devs = ((data || []) as unknown) as D[];

  // pedidos no período (por loja) para a taxa
  let qp = supabase.from("pedidos").select("loja_id, marketplace, pedido_efetivado").gte("data_pedido", desde).eq("pedido_efetivado", true).limit(100000);
  if (lojas) qp = qp.in("loja_id", lojas);
  const { data: peds } = await qp;
  const pedidosPorLoja = new Map<string, number>();
  for (const p of peds || []) pedidosPorLoja.set(p.loja_id, (pedidosPorLoja.get(p.loja_id) || 0) + 1);
  const totalPedidos = [...pedidosPorLoja.values()].reduce((s, n) => s + n, 0);

  const reembolsado = devs.reduce((s, d) => s + Number(d.valor_reembolsado || 0), 0);
  const recuperado = devs.reduce((s, d) => s + Number(d.valor_recuperado || 0), 0);
  const ganhas = devs.filter((d) => d.resultado === "ganha").length;
  const decididas = devs.filter((d) => d.resultado === "ganha" || d.resultado === "perdida").length;
  // voltou ao estoque: inspeções com destino estoque/saldo
  const { data: insp } = await supabase.from("devolucao_inspecoes").select("destino, devolucao_id").not("destino", "is", null).gte("criado_em", desde);
  const voltaram = (insp || []).filter((i) => i.destino === "estoque" || i.destino === "saldo").length;
  const inspecionadas = (insp || []).length;
  const custoLiquido = reembolsado - recuperado;

  const porMotivo = new Map<string, number>();
  for (const d of devs) porMotivo.set(grupoDe(d), (porMotivo.get(grupoDe(d)) || 0) + 1);
  const motivos = [...porMotivo.entries()].sort((a, b) => b[1] - a[1]);
  const maxMotivo = motivos[0]?.[1] || 1;

  // por canal/loja
  const porLoja = new Map<string, { nome: string; canal: string; n: number; ganhas: number; decididas: number; tempos: number[] }>();
  for (const d of devs) {
    const k = d.loja_id;
    const l = porLoja.get(k) || { nome: d.lojas?.apelido ?? k.slice(0, 8), canal: d.canal, n: 0, ganhas: 0, decididas: 0, tempos: [] };
    l.n++;
    if (d.resultado === "ganha") l.ganhas++;
    if (d.resultado === "ganha" || d.resultado === "perdida") l.decididas++;
    porLoja.set(k, l);
  }

  // produtos para agir
  const porSku = new Map<string, { nome: string; sku: string; n: number; custo: number; motivos: Map<string, number> }>();
  for (const d of devs) {
    const it = d.itens?.[0];
    if (!it) continue;
    const k = it.sku || it.nome || "?";
    const p = porSku.get(k) || { nome: it.nome ?? k, sku: it.sku ?? "", n: 0, custo: 0, motivos: new Map() };
    p.n++;
    p.custo += Number(d.valor_reembolsado ?? d.valor_reembolso_pedido ?? 0) - Number(d.valor_recuperado || 0);
    const g = grupoDe(d);
    p.motivos.set(g, (p.motivos.get(g) || 0) + 1);
    porSku.set(k, p);
  }
  const produtos = [...porSku.values()].sort((a, b) => b.custo - a.custo).slice(0, 10);
  // vendas por sku (pedido_itens) para a taxa por produto
  const skus = produtos.map((p) => p.sku).filter(Boolean);
  const vendasPorSku = new Map<string, number>();
  if (skus.length) {
    let qi = supabase.from("pedido_itens").select("model_sku, qtd").in("model_sku", skus).gte("dia", desde.slice(0, 10));
    if (lojas) qi = qi.in("loja_id", lojas);
    const { data: itens } = await qi;
    for (const i of itens || []) vendasPorSku.set(i.model_sku as string, (vendasPorSku.get(i.model_sku as string) || 0) + Number(i.qtd || 0));
  }
  const crescimento = motivos[0] && motivos[0][1] >= 5 ? `“${motivos[0][0]}” é o motivo mais frequente (${motivos[0][1]} casos). ${GRUPOS.find((g) => g.nome === motivos[0][0])?.acao ?? ""}.` : null;

  return (
    <>
      <Cabecalho ativa="analise" titulo="Análise de devoluções" descricao="Quanto as devoluções custam, por quê acontecem e onde agir · últimos 30 dias" />
      <div className="grid grid-cols-2 gap-3.5 md:grid-cols-5">
        <Kpi icone="devolucoes" cor="indigo" rotulo="Devoluções" valor={devs.length} detalhe={totalPedidos ? `${pct((devs.length / totalPedidos) * 100)} dos pedidos` : "sem pedidos no período"} />
        <Kpi icone="financas" cor="vermelho" rotulo="Valor reembolsado" valor={brl(reembolsado, 0)} />
        <Kpi icone="auditoria" cor="verde" rotulo="Recuperado em disputas" valor={brl(recuperado, 0)} detalhe={decididas ? `${ganhas} de ${decididas} ganhas` : "sem disputas decididas"} />
        <Kpi icone="estoque" cor="ceu" rotulo="Voltou ao estoque" valor={inspecionadas ? pct((voltaram / inspecionadas) * 100, 0) : "—"} detalhe={`${voltaram} de ${inspecionadas} inspecionadas`} />
        <Kpi icone="insights" cor="laranja" rotulo="Custo líquido" valor={brl(custoLiquido, 0)} detalhe="reembolsado − recuperado" />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card>
          <CardHeader titulo="Por motivo" />
          {motivos.length === 0 ? (
            <p className="text-[13px] text-texto-2">Sem devoluções no período.</p>
          ) : (
            <div className="space-y-2.5">
              {motivos.map(([nome, n]) => (
                <div key={nome}>
                  <div className="flex justify-between text-[13px]">
                    <span className="text-texto">{nome}</span>
                    <span className="font-semibold text-texto">{n}</span>
                  </div>
                  <Barra pct={(n / maxMotivo) * 100} />
                </div>
              ))}
            </div>
          )}
          {crescimento && <Dica className="mt-3">{crescimento}</Dica>}
        </Card>

        <Card className="xl:col-span-2" semPadding>
          <CardHeader className="px-[18px] pt-4" titulo="Por canal e loja" />
          <Tabela>
            <thead>
              <tr>
                <Th>Loja</Th>
                <Th numerica>Devoluções</Th>
                <Th numerica>Taxa</Th>
                <Th numerica>Disputas ganhas</Th>
              </tr>
            </thead>
            <tbody>
              {[...porLoja.entries()].map(([id, l]) => (
                <Tr key={id}>
                  <Td>
                    <span className="mr-2">
                      <ChipCanal canal={l.canal} />
                    </span>
                    {l.nome}
                  </Td>
                  <Td numerica>{l.n}</Td>
                  <Td numerica>{pedidosPorLoja.get(id) ? pct((l.n / (pedidosPorLoja.get(id) || 1)) * 100) : "—"}</Td>
                  <Td numerica>{l.decididas ? pct((l.ganhas / l.decididas) * 100, 0) : "—"}</Td>
                </Tr>
              ))}
            </tbody>
          </Tabela>
        </Card>
      </div>

      <Card className="mt-6" semPadding>
        <CardHeader className="px-[18px] pt-4" titulo="Produtos para agir" descricao="custo líquido = reembolsado − recuperado (o que voltou ao estoque não entra como perda total)" />
        <Tabela>
          <thead>
            <tr>
              <Th>Produto</Th>
              <Th numerica>Vendas</Th>
              <Th numerica>Devoluções</Th>
              <Th numerica>Taxa</Th>
              <Th>Motivo principal</Th>
              <Th numerica>Custo</Th>
              <Th>O que fazer</Th>
            </tr>
          </thead>
          <tbody>
            {produtos.length === 0 && (
              <Tr>
                <Td colSpan={7} className="text-texto-2">Sem dados no período.</Td>
              </Tr>
            )}
            {produtos.map((p) => {
              const principal = [...p.motivos.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "-";
              const vendas = p.sku ? vendasPorSku.get(p.sku) || 0 : 0;
              return (
                <Tr key={p.sku || p.nome}>
                  <Td>
                    <p className="font-medium text-texto">{p.nome}</p>
                    <p className="text-xs text-texto-2">{p.sku}</p>
                  </Td>
                  <Td numerica>{vendas || "—"}</Td>
                  <Td numerica>{p.n}</Td>
                  <Td numerica>{vendas ? pct((p.n / vendas) * 100) : "—"}</Td>
                  <Td>{principal}</Td>
                  <Td numerica className="font-semibold">{brl(p.custo, 0)}</Td>
                  <Td>
                    <Chip cor="azul">{GRUPOS.find((g) => g.nome === principal)?.acao ?? "Revisar o caso a caso"}</Chip>
                  </Td>
                </Tr>
              );
            })}
          </tbody>
        </Tabela>
      </Card>
    </>
  );
}
