"use client";

import { useState } from "react";

export default function SincronizarTodosProdutosButton() {
  const [loading, setLoading] = useState(false);
  const [progresso, setProgresso] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function sincronizar() {
    setLoading(true);
    setErro(null);
    setProgresso("Iniciando...");

    let statusIdx = 0;
    let offset = 0;
    let total = 0;

    try {
      while (true) {
        const r = await fetch("/api/shopee/produtos/sincronizar-todos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ statusIdx, offset }),
        });
        const texto = await r.text();
        let d: {
          sucesso: boolean;
          erro?: string;
          salvos?: number;
          status?: string;
          proximoStatusIdx?: number;
          proximoOffset?: number;
          done?: boolean;
        };
        try {
          d = JSON.parse(texto);
        } catch {
          throw new Error(`Falha no servidor (HTTP ${r.status}): ${texto.slice(0, 200)}`);
        }
        if (!d.sucesso) throw new Error(d.erro || "Erro ao sincronizar.");

        total += d.salvos ?? 0;
        setProgresso(
          `Status ${d.status || "..."} • ${total} produto(s) sincronizado(s)...`
        );

        if (d.done) break;
        statusIdx = d.proximoStatusIdx ?? statusIdx;
        offset = d.proximoOffset ?? 0;
      }

      setProgresso(`Concluído! ${total} produto(s) sincronizado(s) (todos os status).`);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao sincronizar produtos.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-2xl border border-indigo-800 bg-slate-900 p-6">
      <h2 className="text-2xl font-bold">Sincronizar TODOS os Produtos</h2>
      <p className="mt-2 text-sm text-slate-400">
        Puxa produtos de todos os status (ativos, desativados, esgotados, etc.) —
        necessário para alcançar as avaliações antigas que estão em produtos
        inativos. Roda em ciclos até concluir.
      </p>

      <button
        onClick={sincronizar}
        disabled={loading}
        className="mt-4 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
      >
        {loading ? "Sincronizando..." : "Sincronizar todos os produtos"}
      </button>

      {progresso && <p className="mt-4 text-sm text-slate-200">{progresso}</p>}
      {erro && (
        <div className="mt-3 rounded-xl bg-red-900 px-4 py-3 text-sm text-red-200">
          {erro}
        </div>
      )}
    </div>
  );
}
