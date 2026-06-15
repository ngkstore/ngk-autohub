"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";

const lojas = [
  { id: "todas", nome: "Todas as lojas" },
  { id: "ngk-shopee", nome: "NGK Shopee" },
  { id: "pitibiribas-shopee", nome: "Pitibiribas Shopee" },
  { id: "ngk-tiktok", nome: "NGK TikTok" },
  { id: "pitibiribas-tiktok", nome: "Pitibiribas TikTok" },
];

const periodos = [
  { id: "todos", nome: "Todos" },
  { id: "hoje", nome: "Hoje" },
  { id: "ontem", nome: "Ontem" },
  { id: "7dias", nome: "Últimos 7 dias" },
  { id: "30dias", nome: "Últimos 30 dias" },
  { id: "mes", nome: "Este mês" },
  { id: "ano", nome: "Este ano" },
];

export default function Topbar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const lojaSelecionada = searchParams.get("loja") || "todas";
  const periodoSelecionado = searchParams.get("periodo") || "mes";

  function atualizarFiltro(chave: string, valor: string) {
    const params = new URLSearchParams(searchParams.toString());

    if (valor === "todas" || valor === "todos") {
      params.delete(chave);
    } else {
      params.set(chave, valor);
    }

    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  return (
    <header className="sticky top-0 z-10 border-b border-slate-800 bg-slate-950 px-8 py-4 text-white">
      <div className="flex items-center justify-between gap-6">
        <div className="flex flex-wrap gap-4">
          <div>
            <p className="text-sm text-slate-400">Loja selecionada</p>

            <select
              value={lojaSelecionada}
              onChange={(e) => atualizarFiltro("loja", e.target.value)}
              className="mt-1 rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-sm text-white"
            >
              {lojas.map((loja) => (
                <option key={loja.id} value={loja.id}>
                  {loja.nome}
                </option>
              ))}
            </select>
          </div>

          <div>
            <p className="text-sm text-slate-400">Período</p>

            <select
              value={periodoSelecionado}
              onChange={(e) => atualizarFiltro("periodo", e.target.value)}
              className="mt-1 rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-sm text-white"
            >
              {periodos.map((periodo) => (
                <option key={periodo.id} value={periodo.id}>
                  {periodo.nome}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="text-right">
          <p className="text-sm font-semibold">Gabriel</p>
          <p className="text-xs text-slate-400">Administrador</p>
        </div>
      </div>
    </header>
  );
}
