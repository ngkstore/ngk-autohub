"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Props = {
  vendasPorPeriodo?: { data: string; faturamento: number }[];
  financeiroResumo?: { nome: string; valor: number }[];
  avaliacoesPorNota?: { nota: string; quantidade: number }[];
  faturamentoPorMarketplace?: { marketplace: string; faturamento: number }[];
  pedidosPorStatus?: { status: string; quantidade: number }[];
};

// Cores das séries (dados) ficam fixas: funcionam nos dois temas. Grade, eixos e
// cartões leem os tokens (var(--linha), var(--texto-2), bg-superficie) — A3.
const ESTILO_TOOLTIP = { background: "var(--superficie)", border: "1px solid var(--borda)", borderRadius: 10, color: "var(--texto)", fontSize: 13 };
const coresFinanceiro = ["#22c55e", "#ef4444", "#3b82f6"];
const coresAvaliacoes = ["#ef4444", "#f97316", "#facc15", "#84cc16", "#22c55e"];
const coresMarketplace = ["#3b82f6", "#f97316", "#22c55e", "#8b5cf6"];
const coresStatus = [
  "#22c55e",
  "#3b82f6",
  "#f97316",
  "#8b5cf6",
  "#facc15",
  "#ef4444",
  "#14b8a6",
  "#94a3b8",
];

function temDados(lista?: unknown[]) {
  return Array.isArray(lista) && lista.length > 0;
}

function EmptyChart() {
  return (
    <div className="flex h-80 items-center justify-center rounded-[14px] border border-dashed border-borda text-texto-2">
      Sem dados para o período selecionado.
    </div>
  );
}

export default function DashboardCharts({
  vendasPorPeriodo = [],
  financeiroResumo = [],
  avaliacoesPorNota = [],
  faturamentoPorMarketplace = [],
  pedidosPorStatus = [],
}: Props) {
  return (
    <div className="mt-10 grid grid-cols-1 gap-6 xl:grid-cols-2">
      <div className="rounded-[14px] border border-borda bg-superficie p-[18px] shadow-cartao">
        <h2 className="mb-4 text-[15px] font-semibold text-texto">
          📈 Vendas por Período
        </h2>

        {temDados(vendasPorPeriodo) ? (
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={vendasPorPeriodo}>
                <defs>
                  <linearGradient id="colorVendas" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.05} />
                  </linearGradient>
                </defs>

                <CartesianGrid strokeDasharray="3 3" stroke="var(--linha)" />
                <XAxis dataKey="data" stroke="var(--texto-2)" />
                <YAxis stroke="var(--texto-2)" />
                <Tooltip contentStyle={ESTILO_TOOLTIP} />
                <Area
                  type="monotone"
                  dataKey="faturamento"
                  stroke="#3b82f6"
                  strokeWidth={4}
                  fill="url(#colorVendas)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <EmptyChart />
        )}
      </div>

      <div className="rounded-[14px] border border-borda bg-superficie p-[18px] shadow-cartao">
        <h2 className="mb-4 text-[15px] font-semibold text-texto">
          💰 Financeiro
        </h2>

        {temDados(financeiroResumo) ? (
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={financeiroResumo}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--linha)" />
                <XAxis dataKey="nome" stroke="var(--texto-2)" />
                <YAxis stroke="var(--texto-2)" />
                <Tooltip contentStyle={ESTILO_TOOLTIP} />

                <Bar dataKey="valor" radius={[10, 10, 0, 0]}>
                  {financeiroResumo.map((_, index) => (
                    <Cell
                      key={index}
                      fill={coresFinanceiro[index % coresFinanceiro.length]}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <EmptyChart />
        )}
      </div>

      <div className="rounded-[14px] border border-borda bg-superficie p-[18px] shadow-cartao">
        <h2 className="mb-4 text-[15px] font-semibold text-texto">
          ⭐ Avaliações por Nota
        </h2>

        {temDados(avaliacoesPorNota) ? (
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={avaliacoesPorNota}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--linha)" />
                <XAxis dataKey="nota" stroke="var(--texto-2)" />
                <YAxis stroke="var(--texto-2)" />
                <Tooltip contentStyle={ESTILO_TOOLTIP} />

                <Bar dataKey="quantidade" radius={[10, 10, 0, 0]}>
                  {avaliacoesPorNota.map((_, index) => (
                    <Cell
                      key={index}
                      fill={coresAvaliacoes[index % coresAvaliacoes.length]}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <EmptyChart />
        )}
      </div>

      <div className="rounded-[14px] border border-borda bg-superficie p-[18px] shadow-cartao">
        <h2 className="mb-4 text-[15px] font-semibold text-texto">
          📦 Pedidos por Status
        </h2>

        {temDados(pedidosPorStatus) ? (
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={pedidosPorStatus}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--linha)" />
                <XAxis dataKey="status" stroke="var(--texto-2)" />
                <YAxis stroke="var(--texto-2)" />
                <Tooltip contentStyle={ESTILO_TOOLTIP} />

                <Bar dataKey="quantidade" radius={[10, 10, 0, 0]}>
                  {pedidosPorStatus.map((_, index) => (
                    <Cell
                      key={index}
                      fill={coresStatus[index % coresStatus.length]}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <EmptyChart />
        )}
      </div>

      <div className="rounded-[14px] border border-borda bg-superficie p-[18px] shadow-cartao">
        <h2 className="mb-4 text-[15px] font-semibold text-texto">
          🛒 Faturamento por Loja
        </h2>

        {temDados(faturamentoPorMarketplace) ? (
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={faturamentoPorMarketplace}
                  dataKey="faturamento"
                  nameKey="marketplace"
                  innerRadius={70}
                  outerRadius={120}
                  paddingAngle={5}
                  label
                >
                  {faturamentoPorMarketplace.map((_, index) => (
                    <Cell
                      key={index}
                      fill={coresMarketplace[index % coresMarketplace.length]}
                    />
                  ))}
                </Pie>

                <Tooltip contentStyle={ESTILO_TOOLTIP} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <EmptyChart />
        )}
      </div>
    </div>
  );
}