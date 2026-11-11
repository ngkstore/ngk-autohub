import Link from "next/link";
import type { ReactNode } from "react";

export type Aba = { id: string; nome: ReactNode; contador?: number; href?: string };

/**
 * Abas (Guia.html .tabs): sublinhado índigo na ativa e contador em pílula.
 * Com `href` cada aba é um link (navegação por searchParams, como as telas fazem);
 * sem `href`, use `onChange` num componente cliente.
 */
export function Tabs({ abas, ativa, onChange, className = "" }: { abas: Aba[]; ativa: string; onChange?: (id: string) => void; className?: string }) {
  return (
    <div role="tablist" className={`flex gap-1 overflow-x-auto border-b border-borda ${className}`}>
      {abas.map((a) => {
        const on = a.id === ativa;
        const cls =
          "inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 px-2.5 py-3 text-sm font-medium transition-colors " +
          (on ? "border-primaria font-semibold text-primaria-texto" : "border-transparent text-texto-2 hover:text-texto");
        const conteudo = (
          <>
            {a.nome}
            {typeof a.contador === "number" && (
              <span className={`rounded-full px-1.5 text-[11px] font-bold leading-[18px] ${on ? "bg-chip-azul-fundo text-chip-azul-texto" : "bg-chip-cinza-fundo text-chip-cinza-texto"}`}>
                {a.contador}
              </span>
            )}
          </>
        );
        return a.href ? (
          <Link key={a.id} href={a.href} role="tab" aria-selected={on} className={cls}>
            {conteudo}
          </Link>
        ) : (
          <button key={a.id} type="button" role="tab" aria-selected={on} onClick={() => onChange?.(a.id)} className={cls}>
            {conteudo}
          </button>
        );
      })}
    </div>
  );
}
