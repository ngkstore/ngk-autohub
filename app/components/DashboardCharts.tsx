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
    <div className="flex h-80 items-center justify-center rounded-2xl border border-dashed border-slate-700 text-slate-500">
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
      <div className="rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-lg">
        <h2 className="mb-6 text-2xl font-bold text-white">
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

                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="data" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <Tooltip />
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

      <div className="rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-lg">
        <h2 className="mb-6 text-2xl font-bold text-white">
          💰 Financeiro
        </h2>

        {temDados(financeiroResumo) ? (
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={financeiroResumo}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="nome" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <Tooltip />

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

      <div className="rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-lg">
        <h2 className="mb-6 text-2xl font-bold text-white">
          ⭐ Avaliações por Nota
        </h2>

        {temDados(avaliacoesPorNota) ? (
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={avaliacoesPorNota}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="nota" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <Tooltip />

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

      <div className="rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-lg">
        <h2 className="mb-6 text-2xl font-bold text-white">
          📦 Pedidos por Status
        </h2>

        {temDados(pedidosPorStatus) ? (
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={pedidosPorStatus}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="status" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <Tooltip />

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

      <div className="rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-lg">
        <h2 className="mb-6 text-2xl font-bold text-white">
          🛒 Faturamento por Marketplace
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

                <Tooltip />
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