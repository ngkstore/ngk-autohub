"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useSearchParams, usePathname } from "next/navigation";
import AuthStatus from "./AuthStatus";
import TemaBotao from "./TemaBotao";
import Icone from "./Icone";
import type { Tema } from "@/lib/tema";

type Loja = { id: string; apelido: string };

// Períodos: os quatro principais como botões; os demais no "Mais".
const PRINCIPAIS = [
  { id: "hoje", nome: "Hoje" },
  { id: "7dias", nome: "7 dias" },
  { id: "30dias", nome: "30 dias" },
  { id: "mes", nome: "Mês" },
];
const MAIS = [
  { id: "ontem", nome: "Ontem" },
  { id: "ano", nome: "Este ano" },
  { id: "todos", nome: "Todos (mais lento)" },
];

export default function Topbar({ tema }: { tema: Tema }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [lojas, setLojas] = useState<Loja[]>([]);
  const [sincronizadoEm, setSincronizadoEm] = useState<string | null>(null);
  const [alertasNovos, setAlertasNovos] = useState(0);
  const [maisAberto, setMaisAberto] = useState(false);
  const maisRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/minhas-lojas")
      .then((r) => r.json())
      .then((d) => {
        setLojas(d.lojas || []);
        setSincronizadoEm(d.sincronizado_em ?? null);
        setAlertasNovos(Number(d.alertas_novos) || 0);
      })
      .catch(() => setLojas([]));
  }, []);

  useEffect(() => {
    if (!maisAberto) return;
    const fechar = (e: MouseEvent) => {
      if (!maisRef.current?.contains(e.target as Node)) setMaisAberto(false);
    };
    document.addEventListener("mousedown", fechar);
    return () => document.removeEventListener("mousedown", fechar);
  }, [maisAberto]);

  const lojaSelecionada = searchParams.get("loja") || "todas";
  const periodoSelecionado = searchParams.get("periodo") || "30dias";
  const periodoNoMais = MAIS.find((p) => p.id === periodoSelecionado);

  function atualizarFiltro(chave: string, valor: string) {
    const params = new URLSearchParams(searchParams.toString());
    // Só o seletor de LOJA tem "todas" que limpa o filtro.
    if (chave === "loja" && valor === "todas") params.delete(chave);
    else params.set(chave, valor);
    const query = params.toString();
    // Navegação de PÁGINA INTEIRA: garante que o servidor re-renderiza com o
    // filtro novo, sem cache do App Router nem corrida.
    window.location.assign(query ? `${pathname}?${query}` : pathname);
  }

  function buscar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const q = String(new FormData(e.currentTarget).get("q") || "").trim();
    if (q) window.location.assign(`/pedidos?q=${encodeURIComponent(q)}`);
  }

  const horaSync = sincronizadoEm
    ? new Date(sincronizadoEm).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" })
    : null;

  const botaoSeg = "px-3 py-1.5 text-[13px] font-medium rounded-md transition-colors";
  const segOn = "bg-superficie text-texto shadow-cartao";
  const segOff = "text-texto-2 hover:text-texto";

  return (
    <header className="sticky top-0 z-10 flex h-14 items-center gap-3 border-b border-borda bg-superficie px-5">
      {/* Loja */}
      <label className="relative flex items-center">
        <span className="pointer-events-none absolute left-2.5 text-texto-2">
          <Icone nome="loja" tamanho={15} />
        </span>
        <select
          value={lojaSelecionada}
          onChange={(e) => atualizarFiltro("loja", e.target.value)}
          aria-label="Loja"
          className="h-9 appearance-none rounded-lg border border-borda bg-superficie pl-8 pr-8 text-[13px] font-medium text-texto hover:bg-superficie-2"
        >
          <option value="todas">{lojas.length > 1 ? "Todas as minhas lojas" : "Todas as lojas"}</option>
          {lojas.map((loja) => (
            <option key={loja.id} value={loja.id}>
              {loja.apelido}
            </option>
          ))}
        </select>
        <span className="pointer-events-none absolute right-2.5 text-texto-2">
          <Icone nome="seta_baixo" tamanho={14} />
        </span>
      </label>

      {/* Período */}
      <div role="group" aria-label="Período" className="flex items-center gap-0.5 rounded-lg bg-superficie-2 p-0.5">
        {PRINCIPAIS.map((p) => (
          <button
            key={p.id}
            type="button"
            aria-pressed={periodoSelecionado === p.id}
            onClick={() => atualizarFiltro("periodo", p.id)}
            className={`${botaoSeg} ${periodoSelecionado === p.id ? segOn : segOff}`}
          >
            {p.nome}
          </button>
        ))}
        <div ref={maisRef} className="relative">
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={maisAberto}
            aria-pressed={!!periodoNoMais}
            onClick={() => setMaisAberto((v) => !v)}
            className={`${botaoSeg} flex items-center gap-1 ${periodoNoMais ? segOn : segOff}`}
          >
            {periodoNoMais ? periodoNoMais.nome : "Mais"}
            <Icone nome="seta_baixo" tamanho={13} />
          </button>
          {maisAberto && (
            <div role="menu" className="absolute left-0 top-full z-20 mt-1 min-w-40 rounded-lg border border-borda bg-superficie p-1 shadow-cartao">
              {MAIS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  role="menuitem"
                  onClick={() => atualizarFiltro("periodo", p.id)}
                  className={`block w-full rounded-md px-3 py-1.5 text-left text-[13px] ${periodoSelecionado === p.id ? "bg-primaria-suave text-primaria-texto" : "text-texto hover:bg-superficie-2"}`}
                >
                  {p.nome}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex-1" />

      {/* Busca */}
      <form onSubmit={buscar} className="relative hidden items-center md:flex">
        <span className="pointer-events-none absolute left-2.5 text-texto-2">
          <Icone nome="busca" tamanho={15} />
        </span>
        <input
          name="q"
          type="search"
          placeholder="Buscar pedido, SKU ou produto"
          aria-label="Buscar"
          className="h-9 w-64 rounded-lg border border-borda bg-superficie pl-8 pr-3 text-[13px] text-texto placeholder:text-texto-2 focus:border-primaria focus:outline-none"
        />
      </form>

      {/* Sincronização */}
      <span className="hidden items-center gap-1.5 whitespace-nowrap text-xs text-texto-2 lg:inline-flex" title="Última sincronização concluída">
        <span className={`h-2 w-2 rounded-full ${horaSync ? "bg-sucesso" : "bg-chip-cinza-texto"}`} />
        {horaSync ? `Sincronizado ${horaSync}` : "Sem sincronização"}
      </span>

      <TemaBotao inicial={tema} />

      {/* Alertas */}
      <Link
        href="/alertas"
        aria-label={alertasNovos ? `Alertas: ${alertasNovos} novos` : "Alertas"}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-borda bg-superficie text-texto-2 hover:bg-superficie-2 hover:text-texto"
      >
        <Icone nome="alertas" tamanho={17} />
        {alertasNovos > 0 && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-perigo" />}
      </Link>

      <AuthStatus />
    </header>
  );
}
