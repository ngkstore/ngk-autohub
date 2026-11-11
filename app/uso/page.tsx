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
      <div className="mx-auto max-w-[1400px] p-6">
        <h1 className="text-[22px] font-bold tracking-[-0.01em] text-texto">Consumo de IA</h1>
        <p className="mt-4 text-texto-2">
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
    <div className="mx-auto max-w-[1400px] p-6">
      <h1 className="text-[22px] font-bold tracking-[-0.01em] text-texto">Consumo de IA por conta</h1>
      <p className="mt-0.5 text-[13px] text-texto-2">
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
                  ? "bg-primaria text-texto"
                  : "bg-superficie-2 text-texto hover:bg-chip-cinza-fundo"
              }`}
            >
              {p.rotulo}
            </Link>
          );
        })}
      </div>

      {/* Destaques */}
      <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-3">
        <div className="rounded-2xl border border-chip-verde-fundo bg-superficie p-6">
          <p className="text-sm text-texto-2">Custo total de IA (real)</p>
          <p className="mt-2 text-4xl font-bold text-sucesso">
            {usd(totalCustoUsd)}
          </p>
          <p className="mt-1 text-xs text-texto-2">
            ≈ {brl(totalCustoUsd * COTACAO_USD_BRL)} (a R$ {COTACAO_USD_BRL}/US$)
          </p>
        </div>

        <div className="rounded-[14px] border border-borda bg-superficie p-6 shadow-cartao">
          <p className="text-sm text-texto-2">Respostas geradas</p>
          <p className="mt-2 text-4xl font-bold">{inteiro(totalChamadas)}</p>
          <p className="mt-1 text-xs text-texto-2">no período selecionado</p>
        </div>

        <div className="rounded-[14px] border border-borda bg-superficie p-6 shadow-cartao">
          <p className="text-sm text-texto-2">Cobrança sugerida (total)</p>
          <p className="mt-2 text-4xl font-bold text-sucesso">
            {brl(totalCustoUsd * COTACAO_USD_BRL * MARGEM)}
          </p>
          <p className="mt-1 text-xs text-texto-2">custo × {MARGEM}</p>
        </div>
      </div>

      {/* Tabela por conta */}
      <section className="mt-6 rounded-[14px] border border-borda bg-superficie p-6 shadow-cartao">
        <h2 className="text-[15px] font-semibold text-texto">Consumo por conta</h2>

        <div className="mt-6 overflow-x-auto rounded-xl border border-borda">
          <table className="w-full text-left">
            <thead className="bg-superficie-2 text-xs font-semibold text-texto-2">
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
                    className="border-t border-borda"
                  >
                    <td className="p-4 font-semibold">{l.conta_nome}</td>
                    <td className="p-4">{inteiro(l.chamadas)}</td>
                    <td className="p-4 text-texto">
                      {inteiro(l.chamadas_chat)}
                    </td>
                    <td className="p-4 text-texto">
                      {inteiro(l.chamadas_avaliacao)}
                    </td>
                    <td className="p-4 text-texto-2">
                      {inteiro(l.tokens_entrada)} / {inteiro(l.tokens_saida)}
                    </td>
                    <td className="p-4 text-sucesso">{usd(l.custo_usd)}</td>
                    <td className="p-4 font-semibold text-sucesso">
                      {brl(l.custo_usd * COTACAO_USD_BRL * MARGEM)}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="p-4 text-texto-2" colSpan={7}>
                    Nenhum consumo de IA registrado no período. (A medição começa
                    a partir de agora — respostas antigas não entram.)
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <p className="mt-4 text-xs text-texto-2">
          Preços Anthropic por 1M de tokens: Opus 4.8 = US$5 entrada / US$25
          saída · Haiku 4.5 = US$1 / US$5. Ajuste a cotação e a margem em
          app/uso/page.tsx.
        </p>
      </section>
    </div>
  );
}
