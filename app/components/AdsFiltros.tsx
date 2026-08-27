"use client";

// Seletor de loja + período na página de Ads. Período pode ser "últimos N dias"
// ou um mês específico (?per=30d ou ?per=2026-08). Navega preservando a loja.
export default function AdsFiltros({
  lojas,
  lojaAtual,
  per,
  meses,
}: {
  lojas: { id: string; nome: string }[];
  lojaAtual: string;
  per: string;
  meses: { v: string; l: string }[];
}) {
  const nav = (loja: string, p: string) => {
    const params = new URLSearchParams();
    if (loja && loja !== "todas") params.set("loja", loja);
    params.set("per", p);
    window.location.href = `/ads?${params.toString()}`;
  };
  const cls =
    "rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm font-semibold text-white focus:border-emerald-500 focus:outline-none";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select value={lojaAtual} onChange={(e) => nav(e.target.value, per)} className={cls}>
        <option value="todas">Todas as lojas</option>
        {lojas.map((l) => (
          <option key={l.id} value={l.id}>{l.nome}</option>
        ))}
      </select>
      <select value={per} onChange={(e) => nav(lojaAtual, e.target.value)} className={cls}>
        <optgroup label="Período">
          <option value="7d">Últimos 7 dias</option>
          <option value="15d">Últimos 15 dias</option>
          <option value="30d">Últimos 30 dias</option>
          <option value="60d">Últimos 60 dias</option>
          <option value="90d">Últimos 90 dias</option>
        </optgroup>
        <optgroup label="Mês específico">
          {meses.map((m) => (
            <option key={m.v} value={m.v}>{m.l}</option>
          ))}
        </optgroup>
      </select>
    </div>
  );
}
