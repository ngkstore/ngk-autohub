"use client";

import { useState } from "react";

// Campo de custo editável direto na tabela de Produtos & Margem.
// Salva no blur (ou Enter). Mostra ✓ ao salvar.
export default function CustoInput({
  produtoId,
  inicial,
  idx,
}: {
  produtoId: string;
  inicial: number | null;
  idx?: number; // posição na grade — permite pular pra próxima linha no Enter
}) {
  const [valor, setValor] = useState(
    inicial != null ? String(inicial).replace(".", ",") : ""
  );
  const [estado, setEstado] = useState<"idle" | "salvando" | "ok" | "erro">("idle");

  async function salvar() {
    setEstado("salvando");
    try {
      const r = await fetch("/api/produtos/custo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ produtoId, custo: valor }),
      });
      const d = await r.json();
      setEstado(d.sucesso ? "ok" : "erro");
    } catch {
      setEstado("erro");
    }
    setTimeout(() => setEstado("idle"), 1500);
  }

  return (
    <span className="inline-flex items-center gap-2">
      <span className="text-slate-500">R$</span>
      <input
        data-custo-idx={idx}
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        onBlur={salvar}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            (e.target as HTMLInputElement).blur(); // dispara o salvar (onBlur)
            if (idx != null) {
              const prox = document.querySelector<HTMLInputElement>(
                `input[data-custo-idx="${idx + 1}"]`
              );
              prox?.focus();
              prox?.select();
            }
          }
        }}
        inputMode="decimal"
        placeholder="0,00"
        className="w-24 rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-right text-white focus:border-emerald-500 focus:outline-none"
      />
      {estado === "salvando" && <span className="text-xs text-slate-400">…</span>}
      {estado === "ok" && <span className="text-xs text-emerald-400">✓</span>}
      {estado === "erro" && <span className="text-xs text-red-400">erro</span>}
    </span>
  );
}
