import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";

export type VarianteBotao = "principal" | "secundario" | "destrutivo";

const BASE = "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-[9px] border font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50";
const VARIANTE: Record<VarianteBotao, string> = {
  principal: "border-primaria bg-primaria font-semibold text-white hover:bg-primaria-hover hover:border-primaria-hover",
  secundario: "border-borda bg-superficie text-texto hover:bg-superficie-2",
  destrutivo: "border-chip-vermelho-fundo bg-superficie text-chip-vermelho-texto hover:bg-chip-vermelho-fundo",
};

export function classesBotao(variante: VarianteBotao = "secundario", pequeno = false, extra = "") {
  return `${BASE} ${VARIANTE[variante]} ${pequeno ? "px-[11px] py-1.5 text-xs" : "px-[13px] py-2 text-[13px]"} ${extra}`;
}

// Botão (Guia.html .btn / .pri / .dan / .sm).
export function Botao({
  variante = "secundario",
  pequeno = false,
  className = "",
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variante?: VarianteBotao; pequeno?: boolean; children: ReactNode }) {
  return (
    <button type="button" {...props} className={classesBotao(variante, pequeno, className)}>
      {children}
    </button>
  );
}

// Mesmo visual, como link.
export function BotaoLink({ href, variante = "secundario", pequeno = false, className = "", children, externo = false }: { href: string; variante?: VarianteBotao; pequeno?: boolean; className?: string; children: ReactNode; externo?: boolean }) {
  const cls = classesBotao(variante, pequeno, className);
  return externo ? (
    <a href={href} target="_blank" rel="noreferrer" className={cls}>
      {children}
    </a>
  ) : (
    <Link href={href} className={cls}>
      {children}
    </Link>
  );
}
