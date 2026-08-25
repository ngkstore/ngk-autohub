"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import AuthStatus from "./AuthStatus";

type Loja = { id: string; apelido: string };

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

  const [lojas, setLojas] = useState<Loja[]>([]);

  useEffect(() => {
    fetch("/api/minhas-lojas")
      .then((r) => r.json())
      .then((d) => setLojas(d.lojas || []))
      .catch(() => setLojas([]));
  }, []);

  const lojaSelecionada = searchParams.get("loja") || "todas";
  // Padrão = últimos 30 dias (o dashboard usa isso; "Todos" é all-time explícito).
  const periodoSelecionado = searchParams.get("periodo") || "30dias";

  // Depois que a URL do filtro muda (loja/período), re-busca os dados do servidor.
  // Feito num efeito (após a navegação COMMITAR) pra não ter corrida com o push —
  // era o que fazia o filtro "não pegar" às vezes. Pula a montagem inicial.
  const sp = searchParams.toString();
  const primeira = useRef(true);
  useEffect(() => {
    if (primeira.current) {
      primeira.current = false;
      return;
    }
    router.refresh();
  }, [sp, router]);

  function atualizarFiltro(chave: string, valor: string) {
    const params = new URLSearchParams(searchParams.toString());

    // Só o seletor de LOJA tem "todas" que limpa o filtro. O período sempre é
    // explícito na URL (inclusive "todos"), pra bater com o padrão de 30 dias.
    if (chave === "loja" && valor === "todas") {
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
              <option value="todas">
                {lojas.length > 1 ? "Todas as minhas lojas" : "Todas as lojas"}
              </option>
              {lojas.map((loja) => (
                <option key={loja.id} value={loja.id}>
                  {loja.apelido}
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

        <AuthStatus />
      </div>
    </header>
  );
}
