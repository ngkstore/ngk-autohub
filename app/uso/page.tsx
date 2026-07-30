import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { escopoDoUsuario } from "@/lib/conta";

export const dynamic = "force-dynamic";

// Cotação USD->BRL e margem sugerida de cobrança. Edite à vontade: o custo real
// de IA é pequeno (centavos), então normalmente a cobrança é o custo x margem
// (ou um valor fixo por loja). Aqui a coluna "Cobrança sugerida" = custo x margem.
const COTACAO_USD_BRL = 5.5;
const MARGEM = 5; // ex.: cobra 5x o custo real de IA

type LinhaUso = {
  conta_nome: string;
  conta_id: string | null;
  chamadas: number;
  chamadas_chat: number;
  chamadas_avaliacao: number;
  tokens_entrada: number;
  tokens_saida: number;
  custo_usd: number;
};

type UsoProps = {
  searchParams: Promise<{ periodo?: string }>;
};

// --- Período (fuso de Brasília), fim exclusivo. Padrão: mês atual. ---
function diaBRT(date: Date) {
  return date.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}
function isoInicioBRT(ano: number, mes: number, dia: number) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${ano}-${p(mes)}-${p(dia)}T00:00:00-03:00`;
}
function getPeriodoFiltro(periodo: string): { inicio: string; fim: string } | null {
  const [ano, mes, dia] = diaBRT(new Date()).split("-").map(Number);
  const base = new Date(Date.UTC(ano, mes - 1, dia));
  const isoDe = (d: Date) =>
    isoInicioBRT(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  const deslocar = (dias: number) => {
    const d = new Date(base);
    d.setUTCDate(d.getUTCDate() + dias);
    return isoDe(d);
  };
  const inicioAmanha = deslocar(1);
  switch (periodo) {
    case "7dias":
      return { inicio: deslocar(-7), fim: inicioAmanha };
    case "30dias":
      return { inicio: deslocar(-30), fim: inicioAmanha };
    case "mes":
      return { inicio: isoInicioBRT(ano, mes, 1), fim: inicioAmanha };
    case "tudo":
      return null;
    default:
      return { inicio: isoInicioBRT(ano, mes, 1), fim: inicioAmanha };
  }
}

const PERIODOS = [
  { chave: "mes", rotulo: "Este mês" },
  { chave: "30dias", rotulo: "Últimos 30 dias" },
  { chave: "7dias", rotulo: "Últimos 7 dias" },
  { chave: "tudo", rotulo: "Tudo" },
];

function usd(v: number) {
  return `US$ ${v.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
function brl(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function inteiro(v: number) {
  return v.toLocaleString("pt-BR");
}

export default async function Uso({ searchParams }: UsoProps) {
  const params = await searchParams;
  const periodoChave = params.periodo || "mes";

  const escopo = await escopoDoUsuario();

  if (!escopo.admin) {
    return (
      <div className="p-8 text-white">
        <h1 className="text-4xl font-bold">Consumo de IA</h1>
        <p className="mt-4 text-slate-400">
          Página exclusiva do administrador (cobrança por conta).
        </p>
      </div>
    );
  }

  const periodo = getPeriodoFiltro(periodoChave);

  const { data } = await supabase.rpc("resumo_uso_ia", {
    p_loja_ids: null, // admin vê todas as contas
    p_inicio: periodo?.inicio ?? null,
    p_fim: periodo?.fim ?? null,
  });

  const linhas = ((data as LinhaUso[] | null) || []).map((l) => ({
    ...l,
    custo_usd: Number(l.custo_usd || 0),
  }));

  const totalCustoUsd = linhas.reduce((t, l) => t + l.custo_usd, 0);
  const totalChamadas = linhas.reduce((t, l) => t + l.chamadas, 0);

  return (
    <div className="p-8 text-white">
      <h1 className="text-4xl font-bold">💸 Consumo de IA por conta</h1>
      <p className="mt-2 text-slate-400">
        Custo real de IA (respostas do robô) por cliente, para você cobrar. Chat
        usa Opus, avaliações usam Haiku — cada resposta grava o custo real em
        dólar. A coluna <strong>Cobrança sugerida</strong> é o custo × {MARGEM}.
      </p>

      {/* Filtro de período */}
      <div className="mt-6 flex flex-wrap gap-2">
        {PERIODOS.map((p) => {
          const ativo = p.chave === periodoChave;
          return (
            <Link
              key={p.chave}
              href={`/uso?periodo=${p.chave}`}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition-all ${
                ativo
                  ? "bg-emerald-600 text-white"
                  : "bg-slate-800 text-slate-300 hover:bg-slate-700"
              }`}
            >
              {p.rotulo}
            </Link>
          );
        })}
      </div>

      {/* Destaques */}
      <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-3">
        <div className="rounded-2xl border border-emerald-700 bg-slate-900 p-6">
          <p className="text-sm text-slate-400">Custo total de IA (real)</p>
          <p className="mt-2 text-4xl font-bold text-emerald-300">
            {usd(totalCustoUsd)}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            ≈ {brl(totalCustoUsd * COTACAO_USD_BRL)} (a R$ {COTACAO_USD_BRL}/US$)
          </p>
        </div>

        <div className="rounded-2xl bg-slate-900 p-6">
          <p className="text-sm text-slate-400">Respostas geradas</p>
          <p className="mt-2 text-4xl font-bold">{inteiro(totalChamadas)}</p>
          <p className="mt-1 text-xs text-slate-500">no período selecionado</p>
        </div>

        <div className="rounded-2xl bg-slate-900 p-6">
          <p className="text-sm text-slate-400">Cobrança sugerida (total)</p>
          <p className="mt-2 text-4xl font-bold text-teal-300">
            {brl(totalCustoUsd * COTACAO_USD_BRL * MARGEM)}
          </p>
          <p className="mt-1 text-xs text-slate-500">custo × {MARGEM}</p>
        </div>
      </div>

      {/* Tabela por conta */}
      <section className="mt-10 rounded-2xl bg-slate-900 p-6">
        <h2 className="text-2xl font-bold">Consumo por conta</h2>

        <div className="mt-6 overflow-x-auto rounded-xl border border-slate-800">
          <table className="w-full text-left">
            <thead className="bg-slate-800 text-sm text-slate-300">
              <tr>
                <th className="p-4">Conta</th>
                <th className="p-4">Respostas</th>
                <th className="p-4">Chat</th>
                <th className="p-4">Avaliações</th>
                <th className="p-4">Tokens (in / out)</th>
                <th className="p-4">Custo real</th>
                <th className="p-4">Cobrança sugerida</th>
              </tr>
            </thead>

            <tbody>
              {linhas.length > 0 ? (
                linhas.map((l) => (
                  <tr
                    key={l.conta_id || l.conta_nome}
                    className="border-t border-slate-800"
                  >
                    <td className="p-4 font-semibold">{l.conta_nome}</td>
                    <td className="p-4">{inteiro(l.chamadas)}</td>
                    <td className="p-4 text-slate-300">
                      {inteiro(l.chamadas_chat)}
                    </td>
                    <td className="p-4 text-slate-300">
                      {inteiro(l.chamadas_avaliacao)}
                    </td>
                    <td className="p-4 text-slate-400">
                      {inteiro(l.tokens_entrada)} / {inteiro(l.tokens_saida)}
                    </td>
                    <td className="p-4 text-emerald-300">{usd(l.custo_usd)}</td>
                    <td className="p-4 font-semibold text-teal-300">
                      {brl(l.custo_usd * COTACAO_USD_BRL * MARGEM)}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="p-4 text-slate-400" colSpan={7}>
                    Nenhum consumo de IA registrado no período. (A medição começa
                    a partir de agora — respostas antigas não entram.)
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <p className="mt-4 text-xs text-slate-500">
          Preços Anthropic por 1M de tokens: Opus 4.8 = US$5 entrada / US$25
          saída · Haiku 4.5 = US$1 / US$5. Ajuste a cotação e a margem em
          app/uso/page.tsx.
        </p>
      </section>
    </div>
  );
}
