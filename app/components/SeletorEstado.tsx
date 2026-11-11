"use client";

// Seletor de estado para o gráfico de evolução da entrega. Ao trocar, navega
// preservando loja/período (baseUrl já traz o sufixo), re-renderizando no server.
export default function SeletorEstado({
  estados,
  atual,
  baseUrl,
}: {
  estados: string[];
  atual: string;
  baseUrl: string;
}) {
  return (
    <select
      value={atual}
      onChange={(e) => {
        window.location.href = `${baseUrl}&ufTend=${e.target.value}`;
      }}
      className="rounded-lg border border-borda bg-superficie-2 px-3 py-2 text-sm font-semibold text-texto focus:border-primaria focus:outline-none"
    >
      {estados.map((uf) => (
        <option key={uf} value={uf}>
          {uf}
        </option>
      ))}
    </select>
  );
}
