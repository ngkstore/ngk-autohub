import type { ReactNode } from "react";

// Cartão padrão (Guia.html .card): superfície, borda, raio 14, sombra leve no claro.
export function Card({ children, className = "", semPadding = false }: { children: ReactNode; className?: string; semPadding?: boolean }) {
  return <section className={`rounded-[14px] border border-borda bg-superficie shadow-cartao ${semPadding ? "" : "p-[18px]"} ${className}`}>{children}</section>;
}

// Cabeçalho do cartão: título à esquerda, ações à direita.
export function CardHeader({ titulo, descricao, acoes, className = "" }: { titulo: ReactNode; descricao?: ReactNode; acoes?: ReactNode; className?: string }) {
  return (
    <header className={`mb-3.5 flex items-start justify-between gap-2.5 ${className}`}>
      <div>
        <h2 className="text-[15px] font-semibold text-texto">{titulo}</h2>
        {descricao && <p className="mt-0.5 text-xs text-texto-2">{descricao}</p>}
      </div>
      {acoes && <div className="flex shrink-0 items-center gap-2">{acoes}</div>}
    </header>
  );
}
