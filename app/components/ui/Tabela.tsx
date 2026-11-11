import type { ReactNode } from "react";

/**
 * Tabela (Guia.html): cabeçalho cinza, linha selecionada índigo suave, números à
 * direita (`numerica`), primeira coluna com miniatura + nome + SKU (`Produto`).
 * Use dentro de <Card semPadding> para ocupar toda a largura.
 */
export function Tabela({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`overflow-x-auto ${className}`}>
      <table className="w-full border-collapse text-[13px]">{children}</table>
    </div>
  );
}

export function Th({ children, numerica = false, className = "" }: { children?: ReactNode; numerica?: boolean; className?: string }) {
  return (
    <th className={`whitespace-nowrap border-b border-borda bg-superficie-2 px-3.5 py-2.5 text-xs font-semibold text-texto-2 ${numerica ? "text-right" : "text-left"} ${className}`}>
      {children}
    </th>
  );
}

export function Tr({ children, selecionada = false, className = "", onClick }: { children: ReactNode; selecionada?: boolean; className?: string; onClick?: () => void }) {
  return (
    <tr onClick={onClick} aria-selected={selecionada || undefined} className={`${selecionada ? "bg-primaria-suave" : "hover:bg-superficie-2"} ${onClick ? "cursor-pointer" : ""} ${className}`}>
      {children}
    </tr>
  );
}

export function Td({ children, numerica = false, className = "", colSpan }: { children?: ReactNode; numerica?: boolean; className?: string; colSpan?: number }) {
  return (
    <td colSpan={colSpan} className={`border-b border-linha px-3.5 py-[11px] align-middle text-texto ${numerica ? "text-right tabular-nums" : ""} ${className}`}>
      {children}
    </td>
  );
}

// Primeira coluna: miniatura (imagem ou iniciais) + nome + SKU.
export function Produto({ nome, sku, imagem, extra }: { nome: ReactNode; sku?: ReactNode; imagem?: string | null; extra?: ReactNode }) {
  return (
    <div className="flex min-w-[210px] items-center gap-2.5">
      {imagem ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imagem} alt="" className="h-[38px] w-[38px] shrink-0 rounded-[9px] object-cover" />
      ) : (
        <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[9px] bg-superficie-2 text-xs font-semibold text-texto-2">
          {String(nome ?? "").slice(0, 2).toUpperCase()}
        </span>
      )}
      <div className="min-w-0">
        <p className="truncate font-medium text-texto">{nome}</p>
        {(sku || extra) && (
          <p className="truncate text-xs text-texto-2">
            {sku}
            {sku && extra ? " · " : ""}
            {extra}
          </p>
        )}
      </div>
    </div>
  );
}

// Barra de progresso fina (Guia.html .bar).
export function Barra({ pct, cor = "bg-primaria", className = "" }: { pct: number; cor?: string; className?: string }) {
  const largura = Math.max(0, Math.min(100, pct));
  return (
    <div className={`h-[7px] w-full overflow-hidden rounded bg-linha ${className}`} role="progressbar" aria-valuenow={largura} aria-valuemin={0} aria-valuemax={100}>
      <i className={`block h-[7px] rounded ${cor}`} style={{ width: `${largura}%` }} />
    </div>
  );
}
