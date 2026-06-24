"use client";

import { useState } from "react";

export default function SincronizarAvaliacoesButton() {
  const [loading, setLoading] = useState(false);
  const [progresso, setProgresso] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function sincronizar() {
    setLoading(true);
    setErro(null);
    setProgresso("Iniciando...");

    let cursor = "";
    let total = 0;

    try {
      while (true) {
        const response = await fetch(
          "/api/shopee/avaliacoes/sincronizar",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ cursor, maxPaginas: 40 }),
          }
        );

        const texto = await response.text();

        let data: {
          sucesso: boolean;
          erro?: string;
          processados?: number;
          nextCursor?: string;
          done?: boolean;
        };

        try {
          data = JSON.parse(texto);
        } catch {
          throw new Error(
            `Falha no servidor (HTTP ${response.status}): ${texto.slice(0, 300)}`
          );
        }

        if (!data.sucesso) {
          throw new Error(data.erro || "Erro ao sincronizar avaliações.");
        }

        total += data.processados ?? 0;
        cursor = data.nextCursor ?? "";

        setProgresso(`Sincronizadas ${total} avaliação(ões)...`);

        if (data.done) break;
      }

      setProgresso(`Concluído! ${total} avaliação(ões) sincronizadas.`);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao sincronizar.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-2xl border border-amber-800 bg-slate-900 p-6">
      <h2 className="text-2xl font-bold">Sincronizar Avaliações (histórico)</h2>

      <p className="mt-2 text-sm text-slate-400">
        Importa todas as avaliações da Shopee (incluindo as antigas), marcando
        quais já têm resposta. Roda em ciclos automáticos até concluir.
      </p>

      <button
        onClick={sincronizar}
        disabled={loading}
        className="mt-4 rounded-xl bg-amber-600 px-5 py-3 text-sm font-semibold text-white hover:bg-amber-500 disabled:opacity-50"
      >
        {loading ? "Sincronizando..." : "Sincronizar Avaliações"}
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
