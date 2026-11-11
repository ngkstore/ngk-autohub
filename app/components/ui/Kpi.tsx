import type { ReactNode } from "react";
import Icone, { type NomeIcone } from "../Icone";

export type CorKpi = "indigo" | "verde" | "laranja" | "vermelho" | "ceu" | "roxo" | "amarelo";

const COR_ICONE: Record<CorKpi, string> = {
  indigo: "bg-chip-azul-fundo text-primaria",
  verde: "bg-chip-verde-fundo text-chip-verde-texto",
  laranja: "bg-chip-laranja-fundo text-chip-laranja-texto",
  vermelho: "bg-chip-vermelho-fundo text-chip-vermelho-texto",
  ceu: "bg-chip-ceu-fundo text-chip-ceu-texto",
  roxo: "bg-chip-roxo-fundo text-chip-roxo-texto",
  amarelo: "bg-chip-amarelo-fundo text-chip-amarelo-texto",
};

// Mini-gráfico em SVG (linha simples) para o rodapé do KPI.
export function MiniGrafico({ valores, cor = "var(--primaria)", largura = 84, altura = 28 }: { valores: number[]; cor?: string; largura?: number; altura?: number }) {
  if (valores.length < 2) return null;
  const max = Math.max(...valores);
  const min = Math.min(...valores);
  const faixa = max - min || 1;
  const pontos = valores
    .map((v, i) => `${((i / (valores.length - 1)) * (largura - 2) + 1).toFixed(1)},${(altura - 1 - ((v - min) / faixa) * (altura - 2)).toFixed(1)}`)
    .join(" ");
  return (
    <svg width={largura} height={altura} viewBox={`0 0 ${largura} ${altura}`} aria-hidden="true">
      <polyline points={pontos} fill="none" stroke={cor} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Indicador (Guia.html .kpi): ícone colorido em quadrado de 34 px, rótulo, valor
 * grande, etiqueta de variação (verde/vermelha/neutra) e mini-gráfico opcional.
 * `variacao` em pontos percentuais; `variacaoInvertida` quando cair é bom (custo).
 */
export function Kpi({
  rotulo,
  valor,
  icone,
  cor = "indigo",
  variacao,
  variacaoTexto,
  variacaoInvertida = false,
  detalhe,
  serie,
  className = "",
}: {
  rotulo: ReactNode;
  valor: ReactNode;
  icone?: NomeIcone;
  cor?: CorKpi;
  variacao?: number | null;
  variacaoTexto?: ReactNode;
  variacaoInvertida?: boolean;
  detalhe?: ReactNode;
  serie?: number[];
  className?: string;
}) {
  let etiqueta: ReactNode = null;
  if (typeof variacao === "number" && Number.isFinite(variacao)) {
    const bom = variacaoInvertida ? variacao < 0 : variacao > 0;
    const neutro = Math.abs(variacao) < 0.05;
    const cls = neutro ? "bg-chip-cinza-fundo text-chip-cinza-texto" : bom ? "bg-chip-verde-fundo text-chip-verde-texto" : "bg-chip-vermelho-fundo text-chip-vermelho-texto";
    etiqueta = (
      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${cls}`}>
        {variacao > 0 ? "▲" : variacao < 0 ? "▼" : "•"} {Math.abs(variacao).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%
        {variacaoTexto && <span className="font-medium opacity-80">{variacaoTexto}</span>}
      </span>
    );
  } else if (variacaoTexto) {
    etiqueta = <span className="inline-flex rounded-full bg-chip-cinza-fundo px-2 py-0.5 text-[11px] font-semibold text-chip-cinza-texto">{variacaoTexto}</span>;
  }

  return (
    <div className={`flex flex-col gap-2.5 rounded-[14px] border border-borda bg-superficie p-4 shadow-cartao ${className}`}>
      <div className="flex items-center gap-2.5 text-[13px] font-medium text-texto-2">
        {icone && (
          <span className={`flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px] ${COR_ICONE[cor]}`}>
            <Icone nome={icone} tamanho={17} />
          </span>
        )}
        <span className="truncate">{rotulo}</span>
      </div>
      <div className="text-[26px] font-bold tracking-[-0.02em] text-texto">{valor}</div>
      {(etiqueta || detalhe || serie) && (
        <div className="flex items-end justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2 text-xs text-texto-2">
            {etiqueta}
            {detalhe}
          </div>
          {serie && <MiniGrafico valores={serie} />}
        </div>
      )}
    </div>
  );
}
