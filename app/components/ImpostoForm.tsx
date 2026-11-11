"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Formulário pra lançar o imposto pago de um mês.
export default function ImpostoForm({
  competenciaInicial,
}: {
  competenciaInicial: string;
}) {
  const router = useRouter();
  const [competencia, setCompetencia] = useState(competenciaInicial);
  const [valor, setValor] = useState("");
  const [estado, setEstado] = useState<"idle" | "salvando" | "ok" | "erro">("idle");
  const [msg, setMsg] = useState<string | null>(null);

  async function lancar() {
    setEstado("salvando");
    setMsg(null);
    try {
      const r = await fetch("/api/impostos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ competencia, valor }),
      });
      const d = await r.json();
      if (d.sucesso) {
        setEstado("ok");
        setValor("");
        router.refresh();
      } else {
        setEstado("erro");
        setMsg(d.erro || "Erro ao lançar.");
      }
    } catch {
      setEstado("erro");
      setMsg("Falha de conexão.");
    }
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1 text-xs text-texto-2">
        Competência
        <input
          type="month"
          value={competencia}
          onChange={(e) => setCompetencia(e.target.value)}
          className="rounded-lg border border-borda bg-superficie-2 px-3 py-2 text-texto"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-texto-2">
        Valor pago (R$)
        <input
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          inputMode="decimal"
          placeholder="0,00"
          className="w-36 rounded-lg border border-borda bg-superficie-2 px-3 py-2 text-right text-texto"
        />
      </label>
      <button
        onClick={lancar}
        disabled={estado === "salvando"}
        className="rounded-lg bg-primaria px-5 py-2 text-sm font-semibold text-texto hover:bg-primaria-hover disabled:opacity-50"
      >
        {estado === "salvando" ? "Lançando…" : "Lançar"}
      </button>
      {estado === "ok" && <span className="text-sm text-sucesso">✓ lançado</span>}
      {estado === "erro" && <span className="text-sm text-perigo">{msg}</span>}
    </div>
  );
}
