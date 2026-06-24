"use client";

import { useEffect, useState } from "react";

type ResultadoTeste = {
  sucesso: boolean;
  erro?: string;
  publicados?: number;
  comModelo?: number;
  comIA?: number;
  restantes?: number;
};

export default function ResponderAvaliacoesControl() {
  const [ativo, setAtivo] = useState<boolean | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [testando, setTestando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoTeste | null>(null);

  useEffect(() => {
    fetch("/api/shopee/avaliacoes/auto")
      .then((r) => r.json())
      .then((d) => setAtivo(!!d.ativo))
      .catch(() => setAtivo(false));
  }, []);

  async function alternar() {
    setSalvando(true);
    try {
      const novo = !ativo;
      const r = await fetch("/api/shopee/avaliacoes/auto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ativo: novo }),
      });
      const d = await r.json();
      setAtivo(!!d.ativo);
    } finally {
      setSalvando(false);
    }
  }

  async function testar() {
    setTestando(true);
    setResultado(null);
    try {
      const r = await fetch("/api/shopee/avaliacoes/responder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limite: 5 }),
      });
      const texto = await r.text();
      try {
        setResultado(JSON.parse(texto));
      } catch {
        setResultado({
          sucesso: false,
          erro: `Falha no servidor (HTTP ${r.status}): ${texto.slice(0, 300)}`,
        });
      }
    } catch (e) {
      setResultado({
        sucesso: false,
        erro: e instanceof Error ? e.message : "Erro ao testar.",
      });
    } finally {
      setTestando(false);
    }
  }

  return (
    <div className="rounded-2xl border border-pink-800 bg-slate-900 p-6">
      <h2 className="text-2xl font-bold">Responder Avaliações (robô)</h2>

      <p className="mt-2 text-sm text-slate-400">
        Gera e publica respostas na Shopee: 5★ usam modelo pronto, 1–4★ usam IA
        (Haiku). Quando ligado, roda em sprints de 30 min (20/min) e pausa 30
        min, automaticamente.
      </p>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <span className="text-sm text-slate-300">Robô automático:</span>
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ${
            ativo
              ? "bg-green-900 text-green-300"
              : "bg-slate-700 text-slate-300"
          }`}
        >
          {ativo === null ? "..." : ativo ? "LIGADO" : "DESLIGADO"}
        </span>

        <button
          onClick={alternar}
          disabled={salvando || ativo === null}
          className={`rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 ${
            ativo ? "bg-red-700 hover:bg-red-600" : "bg-green-700 hover:bg-green-600"
          }`}
        >
          {salvando ? "Salvando..." : ativo ? "Desligar" : "Ligar"}
        </button>

        <button
          onClick={testar}
          disabled={testando}
          className="rounded-xl bg-pink-600 px-4 py-2 text-sm font-semibold text-white hover:bg-pink-500 disabled:opacity-50"
        >
          {testando ? "Testando..." : "Testar agora (5)"}
        </button>
      </div>

      {resultado && (
        <div
          className={`mt-4 rounded-xl px-4 py-3 text-sm ${
            resultado.sucesso
              ? "bg-green-900 text-green-200"
              : "bg-red-900 text-red-200"
          }`}
        >
          {resultado.sucesso ? (
            <>
              Publicadas: {resultado.publicados ?? 0} (modelo:{" "}
              {resultado.comModelo ?? 0} • IA: {resultado.comIA ?? 0}). Faltam{" "}
              {resultado.restantes ?? 0}.
              {resultado.erro ? ` Aviso: ${resultado.erro}` : ""}
            </>
          ) : (
            <>{resultado.erro || "Erro ao testar."}</>
          )}
        </div>
      )}
    </div>
  );
}
