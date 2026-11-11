"use client";

import type { ReactNode } from "react";

// Interruptor (Guia.html .sw): cinza desligado, primária ligado.
export function Switch({ ligado, onChange, rotulo, desabilitado = false, className = "" }: { ligado: boolean; onChange: (v: boolean) => void; rotulo?: ReactNode; desabilitado?: boolean; className?: string }) {
  return (
    <label className={`inline-flex cursor-pointer items-center gap-2 text-[13px] text-texto ${desabilitado ? "cursor-not-allowed opacity-50" : ""} ${className}`}>
      <button
        type="button"
        role="switch"
        aria-checked={ligado}
        disabled={desabilitado}
        onClick={() => onChange(!ligado)}
        className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${ligado ? "bg-primaria" : "bg-chip-cinza-fundo border border-borda"}`}
      >
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${ligado ? "translate-x-[18px]" : "translate-x-0.5"}`} />
      </button>
      {rotulo}
    </label>
  );
}
