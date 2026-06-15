"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

export default function FiltroPeriodo() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const periodoAtual = searchParams.get("periodo") || "mes";

  function alterarPeriodo(periodo: string) {
    const params = new URLSearchParams(searchParams.toString());

    if (periodo === "todos") {
      params.delete("periodo");
      params.delete("inicio");
      params.delete("fim");
    } else {
      params.set("periodo", periodo);
      params.delete("inicio");
      params.delete("fim");
    }

    const query = params.toString();

    router.push(query ? `${pathname}?${query}` : pathname);
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="text-sm text-slate-400">Período:</span>

      <select
        value={periodoAtual}
        onChange={(e) => alterarPeriodo(e.target.value)}
        className="rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-sm text-white"
      >
        <option value="todos">Todos</option>
        <option value="hoje">Hoje</option>
        <option value="semana">Esta semana</option>
        <option value="mes">Este mês</option>
        <option value="ano">Este ano</option>
      </select>
    </div>
  );
}