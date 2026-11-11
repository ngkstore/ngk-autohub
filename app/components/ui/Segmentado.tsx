import Link from "next/link";
import type { ReactNode } from "react";

export type OpcaoSegmentada = { id: string; nome: ReactNode; href?: string };

/**
 * Botões segmentados (Guia.html .seg): fundo cinza, a opção ativa em superfície
 * com sombra. Com `href` vira navegação (servidor); sem, usa `onChange` (cliente).
 */
export function Segmentado({ opcoes, ativa, onChange, rotulo, className = "" }: { opcoes: OpcaoSegmentada[]; ativa: string; onChange?: (id: string) => void; rotulo?: string; className?: string }) {
  return (
    <div role="group" aria-label={rotulo} className={`inline-flex items-center gap-0.5 rounded-[10px] bg-superficie-2 p-[3px] ${className}`}>
      {opcoes.map((o) => {
        const on = o.id === ativa;
        const cls = `rounded-lg px-3 py-1.5 text-[13px] transition-colors ${on ? "bg-superficie font-semibold text-texto shadow-cartao" : "font-medium text-texto-2 hover:text-texto"}`;
        return o.href ? (
          <Link key={o.id} href={o.href} aria-current={on ? "true" : undefined} className={cls}>
            {o.nome}
          </Link>
        ) : (
          <button key={o.id} type="button" aria-pressed={on} onClick={() => onChange?.(o.id)} className={cls}>
            {o.nome}
          </button>
        );
      })}
    </div>
  );
}
