import type { ReactNode } from "react";
import { Tabs } from "../components/ui";

// Cabeçalho comum das telas de Devoluções: título + abas (Fila, Recebimento, Regras, Disputas, Análise).
export const ABAS_DEVOLUCOES = [
  { id: "fila", nome: "Fila", href: "/devolucoes" },
  { id: "recebimento", nome: "Recebimento e inspeção", href: "/devolucoes/recebimento" },
  { id: "regras", nome: "Regras e assistente", href: "/devolucoes/regras" },
  { id: "disputas", nome: "Disputas e recuperação", href: "/devolucoes/disputas" },
  { id: "analise", nome: "Análise", href: "/devolucoes/analise" },
];

export default function Cabecalho({ ativa, titulo, descricao, acoes, contadores }: { ativa: string; titulo: string; descricao?: ReactNode; acoes?: ReactNode; contadores?: Record<string, number> }) {
  return (
    <>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold tracking-[-0.01em] text-texto">{titulo}</h1>
          {descricao && <p className="mt-0.5 text-[13px] text-texto-2">{descricao}</p>}
        </div>
        {acoes && <div className="flex flex-wrap items-center gap-2">{acoes}</div>}
      </div>
      <Tabs abas={ABAS_DEVOLUCOES.map((a) => ({ ...a, contador: contadores?.[a.id] }))} ativa={ativa} className="mb-5" />
    </>
  );
}
