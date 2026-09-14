"use client";

// Seletor de loja genérico: navega pra `base?loja=<id>` (ou só `base` = todas).
export default function LojaSeletor({
  lojas,
  atual,
  base,
}: {
  lojas: { id: string; nome: string }[];
  atual: string;
  base: string;
}) {
  return (
    <select
      value={atual}
      onChange={(e) => {
        const v = e.target.value;
        window.location.href = v === "todas" ? base : `${base}?loja=${v}`;
      }}
      className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm font-semibold text-white focus:border-emerald-500 focus:outline-none"
    >
      <option value="todas">Todas as minhas lojas</option>
      {lojas.map((l) => (
        <option key={l.id} value={l.id}>{l.nome}</option>
      ))}
    </select>
  );
}
