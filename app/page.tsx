import { supabase } from "@/lib/supabase";
import DashboardCharts from "./components/DashboardCharts";
import GerarRankingButton from "./components/GerarRankingButton";
import { Card, CardHeader, Kpi, Chip, ChipCanal, ChipStatus, Tabela, Th, Tr, Td, Produto, BotaoLink, Vazio } from "./components/ui";
import { escopoDoUsuario, filtroLojas } from "@/lib/conta";
import { calcularResultado } from "@/lib/financas/resultado";
import { montarEstoque } from "@/lib/estoque/consultas";

export const dynamic = "force-dynamic";

type DashboardProps = {
  searchParams: Promise<{
    loja?: string;
    periodo?: string;
  }>;
};

type PedidoRow = {
  valor_total: number | string | null;
  data_pedido: string | null;
  marketplace: string | null;
  status: string | null;
  pedido_efetivado: boolean | null;
  entra_faturamento: boolean | null;
  pedido_externo_id: string | null;
  cliente_nome: string | null;
};

// Formato retornado pela função SQL resumo_pedidos (cálculo no banco).
type ResumoPedidos = {
  total_pedidos: number;
  pedidos_efetivados: number;
  pedidos_faturados: number;
  pedidos_cancelados: number;
  faturamento_geral: number;
  faturamento_efetivado: number;
  faturamento_concluido: number;
  por_status: { status: string; quantidade: number }[];
  por_marketplace: { marketplace: string; faturamento: number }[];
  vendas_por_dia: { dia: string; faturamento: number }[];
};

// Tradução dos status da Shopee para exibição.
const statusLabels: Record<string, string> = {
  UNPAID: "Não pago",
  READY_TO_SHIP: "Pronto p/ envio",
  PROCESSED: "Processado",
  SHIPPED: "Enviado",
  TO_CONFIRM_RECEIVE: "A confirmar",
  COMPLETED: "Concluído",
  IN_CANCEL: "Em cancelamento",
  CANCELLED: "Cancelado",
  INVOICE_PENDING: "Aguardando NF",
  UNKNOWN: "Desconhecido",
};

function rotuloStatus(status?: string | null) {
  if (!status) return "Sem status";
  return statusLabels[status] || status;
}

// Data (YYYY-MM-DD) no fuso de Brasília.
function diaBRT(date: Date) {
  return date.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

// Início do dia em Brasília como instante absoluto (Brasil usa UTC-3 fixo).
function isoInicioBRT(ano: number, mes: number, dia: number) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${ano}-${p(mes)}-${p(dia)}T00:00:00-03:00`;
}

// Retorna o intervalo [inicio, fim) em Brasília. fim é exclusivo (use < fim),
// para "ontem" não pegar hoje, "este mês" não pegar o mês seguinte, etc.
function getPeriodoFiltro(
  periodo?: string
): { inicio: string; fim: string } | null {
  const [ano, mes, dia] = diaBRT(new Date()).split("-").map(Number);
  const base = new Date(Date.UTC(ano, mes - 1, dia));

  const isoDe = (d: Date) =>
    isoInicioBRT(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());

  const deslocar = (dias: number) => {
    const d = new Date(base);
    d.setUTCDate(d.getUTCDate() + dias);
    return isoDe(d);
  };

  const inicioHoje = isoInicioBRT(ano, mes, dia);
  const inicioAmanha = deslocar(1); // fim padrão (exclusivo) para períodos até hoje

  switch (periodo) {
    case "hoje":
      return { inicio: inicioHoje, fim: inicioAmanha };

    case "ontem":
      return { inicio: deslocar(-1), fim: inicioHoje };

    case "7dias":
      return { inicio: deslocar(-7), fim: inicioAmanha };

    case "30dias":
      return { inicio: deslocar(-30), fim: inicioAmanha };

    case "mes":
      return { inicio: isoInicioBRT(ano, mes, 1), fim: inicioAmanha };

    case "ano":
      return { inicio: isoInicioBRT(ano, 1, 1), fim: inicioAmanha };

    case "todos":
      return null; // all-time (explícito — pode ser mais lento)

    default:
      // Padrão do dashboard: últimos 30 dias (evita a varredura all-time no load).
      return { inicio: deslocar(-30), fim: inicioAmanha };
  }
}

function formatarMoeda(valor: number) {
  return valor.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function formatarDataHora(data: string) {
  return new Date(data).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function num(valor: number | string | null) {
  return Number(valor || 0);
}

function formatarDiaCurto(dia: string) {
  const [, mes, d] = dia.split("-");
  return `${d}/${mes}`;
}

// Fallback (só usado se a função SQL ainda não existir): pagina os pedidos
// para somar tudo no app, contornando o limite de 1000 linhas do Supabase.
type Periodo = { inicio: string; fim: string } | null;

async function buscarTodosPedidos(
  lojaIds: string[] | null,
  periodo: Periodo
): Promise<PedidoRow[]> {
  const pageSize = 1000;
  const maxPaginas = 200; // trava de segurança
  const todos: PedidoRow[] = [];

  for (let pagina = 0; pagina < maxPaginas; pagina++) {
    const de = pagina * pageSize;

    let query = supabase
      .from("pedidos")
      .select(
        "valor_total, data_pedido, marketplace, status, pedido_efetivado, entra_faturamento, pedido_externo_id, cliente_nome"
      )
      .order("data_pedido", { ascending: false, nullsFirst: false })
      .range(de, de + pageSize - 1);

    if (lojaIds) query = query.in("loja_id", lojaIds);
    if (periodo) {
      query = query
        .gte("data_pedido", periodo.inicio)
        .lt("data_pedido", periodo.fim);
    }

    const { data, error } = await query;

    if (error || !data || data.length === 0) break;

    todos.push(...(data as PedidoRow[]));

    if (data.length < pageSize) break;
  }

  return todos;
}

type ResumoCalculado = {
  totalPedidos: number;
  efetivadosCount: number;
  faturadosCount: number;
  canceladosCount: number;
  faturamentoGeral: number;
  faturamentoEfetivado: number;
  faturamentoConcluido: number;
  vendasPorPeriodo: { data: string; faturamento: number }[];
  faturamentoPorMarketplace: { marketplace: string; faturamento: number }[];
  pedidosPorStatus: { status: string; quantidade: number }[];
};

// Calcula o resumo: tenta a função SQL (rápida e ilimitada) e, se ela ainda
// não existir, cai no fallback paginado no app.
async function calcularResumoPedidos(
  lojaIds: string[] | null,
  periodo: Periodo
): Promise<ResumoCalculado> {
  const { data: resumoRpc } = await supabase.rpc("resumo_pedidos", {
    p_loja_ids: lojaIds,
    p_inicio: periodo?.inicio ?? null,
    p_fim: periodo?.fim ?? null,
  });

  const resumo = resumoRpc as ResumoPedidos | null;

  if (resumo) {
    return {
      totalPedidos: num(resumo.total_pedidos),
      efetivadosCount: num(resumo.pedidos_efetivados),
      faturadosCount: num(resumo.pedidos_faturados),
      canceladosCount: num(resumo.pedidos_cancelados),
      faturamentoGeral: num(resumo.faturamento_geral),
      faturamentoEfetivado: num(resumo.faturamento_efetivado),
      faturamentoConcluido: num(resumo.faturamento_concluido),
      vendasPorPeriodo: (resumo.vendas_por_dia || []).map((v) => ({
        data: formatarDiaCurto(v.dia),
        faturamento: num(v.faturamento),
      })),
      faturamentoPorMarketplace: (resumo.por_marketplace || []).map((m) => ({
        marketplace: m.marketplace || "sem marketplace",
        faturamento: num(m.faturamento),
      })),
      pedidosPorStatus: (resumo.por_status || []).map((s) => ({
        status: rotuloStatus(s.status),
        quantidade: num(s.quantidade),
      })),
    };
  }

  // RPC indisponível/timeout (ex.: período "Todos" muito grande): retorna zeros.
  // NÃO paginamos os pedidos no app (isso puxava 65k linhas e saturava o banco).
  // O usuário deve escolher um período menor.
  return {
    totalPedidos: 0,
    efetivadosCount: 0,
    faturadosCount: 0,
    canceladosCount: 0,
    faturamentoGeral: 0,
    faturamentoEfetivado: 0,
    faturamentoConcluido: 0,
    vendasPorPeriodo: [],
    faturamentoPorMarketplace: [],
    pedidosPorStatus: [],
  };
}

export default async function Dashboard({ searchParams }: DashboardProps) {
  const params = await searchParams;

  const periodo = getPeriodoFiltro(params.periodo);
  const escopo = await escopoDoUsuario();
  const lojas = filtroLojas(escopo, params.loja);

  let avaliacoesQuery = supabase
    .from("avaliacoes")
    .select("*", { count: "exact", head: true });

  let ultimasQuery = supabase
    .from("avaliacoes")
    .select("*")
    .order("criado_em", { ascending: false })
    .limit(5);

  let rankingQuery = supabase
    .from("ranking_produtos")
    .select("*, produtos(nome, sku), lojas(apelido)")
    .order("faturamento", { ascending: false })
    .limit(10);

  // Pedidos efetivados recentes (query leve com limite — sem problema de 1000).
  let recentesQuery = supabase
    .from("pedidos")
    .select(
      "valor_total, marketplace, status, pedido_externo_id, cliente_nome, data_pedido"
    )
    .eq("pedido_efetivado", true)
    .not("data_pedido", "is", null)
    .order("data_pedido", { ascending: false })
    .limit(20);

  if (lojas) {
    avaliacoesQuery = avaliacoesQuery.in("loja_id", lojas);
    ultimasQuery = ultimasQuery.in("loja_id", lojas);
    rankingQuery = rankingQuery.in("loja_id", lojas);
    recentesQuery = recentesQuery.in("loja_id", lojas);
  }

  if (periodo) {
    avaliacoesQuery = avaliacoesQuery
      .gte("criado_em", periodo.inicio)
      .lt("criado_em", periodo.fim);
    ultimasQuery = ultimasQuery
      .gte("criado_em", periodo.inicio)
      .lt("criado_em", periodo.fim);
    recentesQuery = recentesQuery
      .gte("data_pedido", periodo.inicio)
      .lt("data_pedido", periodo.fim);
  }

  const lojaScope =
    escopo.lojaIds.length > 0 ? escopo.lojaIds : ["00000000-0000-0000-0000-000000000000"];

  // Tudo em PARALELO (antes era uma query após a outra -> load lento).
  const [
    resumo,
    { count: totalAvaliacoes },
    { data: resumoAvalData },
    { data: ultimasAvaliacoes },
    estoque,
    { data: resFinancas },
    { data: resCmv },
    { data: rankingProdutos },
    { data: efetivadosRecentesData },
    { count: totalLojas },
    { count: lojasAtivas },
  ] = await Promise.all([
    calcularResumoPedidos(lojas, periodo),
    avaliacoesQuery,
    supabase.rpc("resumo_avaliacoes", {
      p_loja_ids: lojas,
      p_inicio: periodo?.inicio ?? null,
      p_fim: periodo?.fim ?? null,
    }),
    ultimasQuery,
    // Mesma fonte da tela Estoque (rupturas = SKU zerado com venda nos últimos 30 d).
    montarEstoque(lojas).catch(() => null),
    // Mesma fonte de Finanças > Balanço (resultado e lucro líquido do período).
    supabase.rpc("resumo_financas", { p_loja_ids: lojas, p_inicio: periodo?.inicio ?? null, p_fim: periodo?.fim ?? null, p_conta: escopo.contaId }),
    supabase.rpc("resumo_cmv", { p_loja_ids: lojas, p_inicio: periodo?.inicio ?? null, p_fim: periodo?.fim ?? null }),
    rankingQuery,
    recentesQuery,
    supabase.from("lojas").select("*", { count: "exact", head: true }).in("id", lojaScope),
    supabase
      .from("lojas")
      .select("*", { count: "exact", head: true })
      .in("id", lojaScope)
      .in("status", ["ativo", "ativa"]),
  ]);

  const resumoAval = (resumoAvalData as {
    total: number; media: number; n1: number; n2: number; n3: number; n4: number; n5: number; respondidas?: number; pelo_robo?: number;
  } | null) || { total: 0, media: 0, n1: 0, n2: 0, n3: 0, n4: 0, n5: 0, respondidas: 0, pelo_robo: 0 };
  const efetivadosRecentes = (efetivadosRecentesData as PedidoRow[]) || [];

  const ticketMedio =
    resumo.efetivadosCount > 0
      ? resumo.faturamentoEfetivado / resumo.efetivadosCount
      : 0;

  const taxaEfetivacao =
    resumo.totalPedidos > 0
      ? Math.round((resumo.efetivadosCount / resumo.totalPedidos) * 100)
      : 0;

  // Resultado e lucro líquido: mesma conta de Finanças > Balanço (lib/financas/resultado.ts).
  const fin = calcularResultado(resFinancas as Record<string, unknown> | null, resCmv as Record<string, unknown> | null);
  const lucroEstimado = fin.lucro;
  const produtosSemEstoque = estoque ? estoque.linhas.filter((l) => l.status === "ruptura").length : null;

  const notaMedia = Number(resumoAval.media || 0).toFixed(1);
  const respondidas = Number(resumoAval.respondidas || 0);
  const peloRobo = Number(resumoAval.pelo_robo || 0);
  const pctRespondidas = totalAvaliacoes ? Math.round((respondidas / totalAvaliacoes) * 100) : 0;
  const taxaAutomacao = respondidas ? Math.round((peloRobo / respondidas) * 100) : 0;

  const financeiroResumo = [
    { nome: "Receita", valor: fin.receita },
    { nome: "Resultado", valor: fin.resultado },
    { nome: "Lucro líquido", valor: fin.lucro },
  ];

  const avaliacoesPorNota = [1, 2, 3, 4, 5].map((nota) => ({
    nota: `${nota} estrela${nota > 1 ? "s" : ""}`,
    quantidade: Number(
      resumoAval[`n${nota}` as "n1" | "n2" | "n3" | "n4" | "n5"] || 0
    ),
  }));

  return (
    <div className="mx-auto max-w-[1400px] p-6">
      {/* Título e ações */}
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold tracking-[-0.01em] text-texto">Visão geral</h1>
          <p className="mt-0.5 text-[13px] text-texto-2">Resumo das operações. Use o seletor de loja e o período no topo para filtrar.</p>
        </div>
        <GerarRankingButton />
      </div>

      {/* Indicadores principais */}
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-5">
        <Kpi icone="financas" cor="indigo" rotulo="Faturamento efetivado" valor={formatarMoeda(resumo.faturamentoEfetivado)} detalhe={`${resumo.efetivadosCount} pedido(s) efetivado(s)`} />
        <Kpi icone="pedidos" cor="ceu" rotulo="Pedidos" valor={resumo.totalPedidos.toLocaleString("pt-BR")} detalhe={`${taxaEfetivacao}% efetivados`} />
        <Kpi icone="alvo" cor="roxo" rotulo="Ticket médio (efetivado)" valor={formatarMoeda(ticketMedio)} />
        <Kpi icone="insights" cor="verde" rotulo="Lucro líquido" valor={fin.cobertura > 0 ? formatarMoeda(lucroEstimado) : "—"} detalhe={fin.cobertura > 0 ? `margem ${fin.margemLucro.toFixed(1)}% · mesma conta de Finanças` : "cadastre os custos em Finanças"} />
        <Kpi icone="avaliacoes" cor="amarelo" rotulo="Nota média" valor={notaMedia} detalhe={`${pctRespondidas}% das avaliações respondidas`} />
      </div>

      <p className="mt-2 text-xs text-texto-2">
        Receita = pedidos pagos e não cancelados, pelo dia do pagamento. Shopee: subtotal do vendedor (merchant_subtotal). TikTok: preço original − desconto do vendedor, sem frete e com o desconto pago pela plataforma (que o TikTok repassa). Por isso fica abaixo do GMV do Seller Center, que soma o preço pago pelo cliente de todos os pedidos criados no dia, inclusive os cancelados depois.
      </p>
      {/* Indicadores secundários */}
      <div className="mt-3.5 grid grid-cols-2 gap-3.5 md:grid-cols-3 xl:grid-cols-6">
        <Kpi rotulo="Faturamento geral" valor={formatarMoeda(resumo.faturamentoGeral)} detalhe="inclui pendentes e cancelados" />
        <Kpi rotulo="Faturamento concluído" valor={formatarMoeda(resumo.faturamentoConcluido)} detalhe={`${resumo.faturadosCount} concluído(s) / a confirmar`} />
        <Kpi rotulo="Cancelados / não efetivados" valor={resumo.canceladosCount.toLocaleString("pt-BR")} />
        <Kpi rotulo="Produtos em ruptura" valor={produtosSemEstoque === null ? "—" : produtosSemEstoque.toLocaleString("pt-BR")} detalhe="estoque zero com venda em 30 d · tela Estoque" />
        <Kpi rotulo="Lojas ativas" valor={`${lojasAtivas ?? 0}/${totalLojas ?? 0}`} />
        <Kpi rotulo="Taxa de automação" valor={`${taxaAutomacao}%`} detalhe={`${peloRobo.toLocaleString("pt-BR")} de ${respondidas.toLocaleString("pt-BR")} respostas pelo robô`} />
      </div>

      <DashboardCharts
        vendasPorPeriodo={resumo.vendasPorPeriodo}
        financeiroResumo={financeiroResumo}
        avaliacoesPorNota={avaliacoesPorNota}
        faturamentoPorMarketplace={resumo.faturamentoPorMarketplace}
        pedidosPorStatus={resumo.pedidosPorStatus}
      />

      {/* Pedidos efetivados recentes */}
      <Card className="mt-6" semPadding>
        <CardHeader className="px-[18px] pt-4" titulo="Pedidos efetivados recentes" descricao="Vendas reais (não canceladas) com valor, cliente, status e data." acoes={<BotaoLink href="/pedidos" pequeno>Ver pedidos</BotaoLink>} />
        <Tabela>
          <thead>
            <tr>
              <Th>Pedido</Th>
              <Th>Cliente</Th>
              <Th>Canal</Th>
              <Th numerica>Valor</Th>
              <Th>Status</Th>
              <Th>Data</Th>
            </tr>
          </thead>
          <tbody>
            {efetivadosRecentes.length > 0 ? (
              efetivadosRecentes.map((pedido, index) => (
                <Tr key={`${pedido.pedido_externo_id}-${index}`}>
                  <Td className="font-semibold">{pedido.pedido_externo_id || "-"}</Td>
                  <Td>{pedido.cliente_nome || "-"}</Td>
                  <Td>{pedido.marketplace ? <ChipCanal canal={pedido.marketplace} /> : "-"}</Td>
                  <Td numerica className="font-semibold">{formatarMoeda(num(pedido.valor_total))}</Td>
                  <Td>
                    <ChipStatus tipo={pedido.status === "COMPLETED" ? "ok" : pedido.status === "CANCELLED" ? "parado" : "andamento"}>{rotuloStatus(pedido.status)}</ChipStatus>
                  </Td>
                  <Td className="text-texto-2">{pedido.data_pedido ? formatarDataHora(pedido.data_pedido) : "-"}</Td>
                </Tr>
              ))
            ) : (
              <Tr>
                <Td colSpan={6} className="text-texto-2">Nenhum pedido efetivado encontrado para o filtro selecionado.</Td>
              </Tr>
            )}
          </tbody>
        </Tabela>
      </Card>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        {/* Top 10 produtos */}
        <Card className="xl:col-span-2" semPadding>
          <CardHeader className="px-[18px] pt-4" titulo="Top 10 produtos" descricao="Ranking baseado nos dados importados no AutoHub." />
          <Tabela>
            <thead>
              <tr>
                <Th>#</Th>
                <Th>Produto</Th>
                <Th>Loja</Th>
                <Th numerica>Pedidos</Th>
                <Th numerica>Faturamento</Th>
                <Th numerica>Lucro</Th>
              </tr>
            </thead>
            <tbody>
              {rankingProdutos && rankingProdutos.length > 0 ? (
                rankingProdutos.map((item, index) => (
                  <Tr key={item.id}>
                    <Td className="font-bold text-texto-2">{index + 1}</Td>
                    <Td>
                      <Produto nome={item.produtos?.nome || "Produto sem nome"} sku={item.produtos?.sku || "Sem SKU"} />
                    </Td>
                    <Td className="text-texto-2">{item.lojas?.apelido || "Sem loja"}</Td>
                    <Td numerica>{item.pedidos ?? 0}</Td>
                    <Td numerica className="font-semibold">{formatarMoeda(Number(item.faturamento || 0))}</Td>
                    <Td numerica className={Number(item.lucro || 0) < 0 ? "text-perigo" : "text-sucesso"}>{formatarMoeda(Number(item.lucro || 0))}</Td>
                  </Tr>
                ))
              ) : (
                <Tr>
                  <Td colSpan={6} className="text-texto-2">Nenhum ranking gerado ainda. Clique em “Gerar Ranking”.</Td>
                </Tr>
              )}
            </tbody>
          </Tabela>
        </Card>

        {/* Últimas avaliações */}
        <Card>
          <CardHeader titulo="Últimas avaliações" acoes={<BotaoLink href="/avaliacoes" pequeno>Ver todas</BotaoLink>} />
          <div className="space-y-2.5">
            {ultimasAvaliacoes && ultimasAvaliacoes.length > 0 ? (
              ultimasAvaliacoes.map((item) => (
                <div key={item.id} className="rounded-[10px] border border-linha bg-superficie-2 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-semibold text-texto">{item.nome_produto}</p>
                      <p className="truncate text-xs text-texto-2">{item.nome_cliente}</p>
                    </div>
                    <Chip cor={Number(item.avaliacao || 0) >= 4 ? "verde" : Number(item.avaliacao || 0) === 3 ? "amarelo" : "vermelho"}>
                      {"★".repeat(Number(item.avaliacao || 0))}
                    </Chip>
                  </div>
                  {item.comentario && <p className="mt-2 line-clamp-3 text-[12.5px] leading-relaxed text-texto">{item.comentario}</p>}
                  <p className="mt-1.5 text-[11px] text-texto-2">{item.status || "recebida"}</p>
                </div>
              ))
            ) : (
              <Vazio titulo="Nenhuma avaliação" texto="Nada encontrado para o filtro selecionado." />
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
