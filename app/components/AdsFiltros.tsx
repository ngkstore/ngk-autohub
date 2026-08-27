"use client";

// Seletor de loja + período na própria página de Ads. Navega preservando o
// outro filtro (loja via ?loja=, período em dias via ?dias=).
export default function AdsFiltros({
  lojas,
  lojaAtual,
  dias,
}: {
  lojas: { id: string; nome: string }[];
  lojaAtual: string;
  dias: string;
}) {
  const nav = (loja: string, d: string) => {
    const p = new URLSearchParams();
    if (loja && loja !== "todas") p.set("loja", loja);
    p.set("dias", d);
    window.location.href = `/ads?${p.toString()}`;
  };
  const cls =
    "rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm font-semibold text-white focus:border-emerald-500 focus:outline-none";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select value={lojaAtual} onChange={(e) => nav(e.target.value, dias)} className={cls}>
        <option value="todas">Todas as lojas</option>
        {lojas.map((l) => (
          <option key={l.id} value={l.id}>
            {l.nome}
          </option>
        ))}
      </select>
      <select value={dias} onChange={(e) => nav(lojaAtual, e.target.value)} className={cls}>
        <option value="7">Últimos 7 dias</option>
        <option value="15">Últimos 15 dias</option>
        <option value="30">Últimos 30 dias</option>
        <option value="60">Últimos 60 dias</option>
        <option value="90">Últimos 90 dias</option>
      </select>
    </div>
  );
}
