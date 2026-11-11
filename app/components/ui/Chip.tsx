import type { ReactNode } from "react";
import type { Urgencia } from "@/lib/formato";

export type CorChip = "vermelho" | "laranja" | "amarelo" | "verde" | "azul" | "ceu" | "roxo" | "cinza" | "shopee" | "tiktok";

const COR: Record<CorChip, string> = {
  vermelho: "bg-chip-vermelho-fundo text-chip-vermelho-texto",
  laranja: "bg-chip-laranja-fundo text-chip-laranja-texto",
  amarelo: "bg-chip-amarelo-fundo text-chip-amarelo-texto",
  verde: "bg-chip-verde-fundo text-chip-verde-texto",
  azul: "bg-chip-azul-fundo text-chip-azul-texto",
  ceu: "bg-chip-ceu-fundo text-chip-ceu-texto",
  roxo: "bg-chip-roxo-fundo text-chip-roxo-texto",
  cinza: "bg-chip-cinza-fundo text-chip-cinza-texto",
  shopee: "bg-chip-shopee-fundo text-chip-shopee-texto",
  tiktok: "bg-chip-tiktok-fundo text-chip-tiktok-texto",
};

// Etiqueta (Guia.html .chip): fundo claro + texto escuro da mesma cor no claro;
// translúcido + texto claro no escuro (os pares vêm dos tokens).
export function Chip({ cor = "cinza", children, className = "", ponto = false }: { cor?: CorChip; children: ReactNode; className?: string; ponto?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-[3px] text-xs font-semibold ${COR[cor]} ${className}`}>
      {ponto && <span className="h-[7px] w-[7px] rounded-full bg-current" />}
      {children}
    </span>
  );
}

// Canal: Shopee laranja, TikTok preto.
export function ChipCanal({ canal }: { canal: "shopee" | "tiktok" | "tiktok_shop" | string }) {
  const tk = canal === "tiktok" || canal === "tiktok_shop";
  return <Chip cor={tk ? "tiktok" : "shopee"}>{tk ? "TikTok" : "Shopee"}</Chip>;
}

// Prazo: vermelho até 4 h ou vencido, laranja hoje, amarelo amanhã, cinza depois.
const COR_URGENCIA: Record<Urgencia, CorChip> = { agora: "vermelho", hoje: "laranja", amanha: "amarelo", depois: "cinza" };
export function ChipPrazo({ urgencia, children }: { urgencia: Urgencia; children: ReactNode }) {
  return <Chip cor={COR_URGENCIA[urgencia]}>{children}</Chip>;
}

// Status: verde (ok/feito), azul (em andamento), cinza (parado/encerrado).
export function ChipStatus({ tipo, children }: { tipo: "ok" | "andamento" | "parado"; children: ReactNode }) {
  return <Chip cor={tipo === "ok" ? "verde" : tipo === "andamento" ? "azul" : "cinza"} ponto>{children}</Chip>;
}
