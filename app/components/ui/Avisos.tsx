import type { ReactNode } from "react";

// Dica (Guia.html .tip): fundo primária suave, texto índigo.
export function Dica({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-[10px] bg-primaria-suave px-3 py-2.5 text-[12.5px] leading-relaxed text-primaria-texto ${className}`}>{children}</div>;
}

// Aviso (Guia.html .warn): laranja.
export function Aviso({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-[10px] bg-chip-laranja-fundo px-3 py-2.5 text-[12.5px] leading-relaxed text-chip-laranja-texto ${className}`}>{children}</div>;
}

// Erro: vermelho.
export function Erro({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-[10px] bg-chip-vermelho-fundo px-3 py-2.5 text-[12.5px] leading-relaxed text-chip-vermelho-texto ${className}`}>{children}</div>;
}

// Estado vazio: ícone opcional, título e texto, ação opcional.
export function Vazio({ titulo, texto, acao, className = "" }: { titulo: ReactNode; texto?: ReactNode; acao?: ReactNode; className?: string }) {
  return (
    <div className={`flex flex-col items-center justify-center gap-1.5 rounded-[14px] border border-dashed border-borda px-6 py-10 text-center ${className}`}>
      <p className="text-sm font-semibold text-texto">{titulo}</p>
      {texto && <p className="max-w-md text-xs text-texto-2">{texto}</p>}
      {acao && <div className="mt-2">{acao}</div>}
    </div>
  );
}

// Coluna lateral de detalhe (Guia.html .det): cartão fixo à direita, com título e seções.
export function PainelDetalhe({ titulo, subtitulo, acoes, children, className = "" }: { titulo: ReactNode; subtitulo?: ReactNode; acoes?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <aside className={`sticky top-[72px] flex max-h-[calc(100vh-88px)] flex-col overflow-hidden rounded-[14px] border border-borda bg-superficie shadow-cartao ${className}`}>
      <header className="flex items-start justify-between gap-2 border-b border-borda px-[18px] py-3.5">
        <div className="min-w-0">
          <h3 className="truncate text-[15px] font-semibold text-texto">{titulo}</h3>
          {subtitulo && <p className="truncate text-xs text-texto-2">{subtitulo}</p>}
        </div>
        {acoes && <div className="flex shrink-0 items-center gap-2">{acoes}</div>}
      </header>
      <div className="flex-1 overflow-y-auto px-[18px] py-3.5">{children}</div>
    </aside>
  );
}

// Seção dentro do painel de detalhe.
export function SecaoDetalhe({ titulo, children, className = "" }: { titulo: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`mb-4 ${className}`}>
      <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-texto-2">{titulo}</h4>
      {children}
    </section>
  );
}

// Linha "rótulo: valor" para listas de detalhe.
export function LinhaDetalhe({ rotulo, valor, destaque = false }: { rotulo: ReactNode; valor: ReactNode; destaque?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-linha py-1.5 text-[13px] last:border-0">
      <span className="text-texto-2">{rotulo}</span>
      <span className={`text-right tabular-nums ${destaque ? "font-semibold text-texto" : "text-texto"}`}>{valor}</span>
    </div>
  );
}
