"use client";

import { useState } from "react";

// Campo de custo por variação (model_sku), salva na custos_variacao.
// Enter salva e pula pra próxima linha (usa data-cvidx).
export default function CustoVariacaoInput({
  lojaId,
  modelSku,
  inicial,
  idx,
}: {
  lojaId: string;
  modelSku: string;
  inicial: number | null;
  idx?: number;
}) {
  const [valor, setValor] = useState(inicial != null ? String(inicial).replace(".", ",") : "");
  const [estado, setEstado] = useState<"idle" | "salvando" | "ok" | "erro">("idle");

  async function salvar() {
    setEstado("salvando");
    try {
      const r = await fetch("/api/produtos/custo-variacao", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lojaId, modelSku, custo: valor }),
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
        data-cvidx={idx}
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        onBlur={salvar}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            (e.target as HTMLInputElement).blur();
            if (idx != null) {
              const prox = document.querySelector<HTMLInputElement>(`input[data-cvidx="${idx + 1}"]`);
              prox?.focus();
              prox?.select();
            }
          }
        }}
        inputMode="decimal"
        placeholder="herda item"
        className="w-24 rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-right text-white focus:border-emerald-500 focus:outline-none"
      />
      {estado === "salvando" && <span className="text-xs text-slate-400">…</span>}
      {estado === "ok" && <span className="text-xs text-emerald-400">✓</span>}
      {estado === "erro" && <span className="text-xs text-red-400">erro</span>}
    </span>
  );
}
