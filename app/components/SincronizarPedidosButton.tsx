"use client";

import { useState } from "react";

type Props = {
  lojaId?: string;
};

type Resultado = {
  sucesso: boolean;
  mensagem?: string;
  erro?: string;
  janelaDias?: number;
  lotesProcessados?: number;
  totalPedidos?: number;
  resultados?: Array<{
    jobId: string;
    status: string;
    total: number;
    mensagem: string;
    debugPrimeiroRetorno?: unknown;
  }>;
};

export default function SincronizarPedidosButton({ lojaId }: Props) {
  const [loading, setLoading] = useState(false);
  const [dias, setDias] = useState(7);
  const [resultado, setResultado] = useState<Resultado | null>(null);

  async function sincronizar() {
    if (!lojaId) {
      alert("Nenhuma loja Shopee selecionada.");
      return;
    }

    try {
      setLoading(true);
      setResultado(null);

      const response = await fetch("/api/shopee/pedidos/sincronizar-agora", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lojaId, dias }),
      });

      const texto = await response.text();

      let data: Resultado;
      try {
        data = JSON.parse(texto);
      } catch {
        // Resposta não-JSON (ex.: erro/timeout da Vercel). Mostra o texto cru.
        data = {
          sucesso: false,
          erro: `Falha no servidor (HTTP ${response.status}). Resposta: ${texto.slice(
            0,
            500
          )}`,
        };
      }

      setResultado(data);
    } catch (error) {
      setResultado({
        sucesso: false,
        erro:
          error instanceof Error
            ? error.message
            : "Erro ao chamar a sincronização.",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-2xl border border-emerald-800 bg-slate-900 p-6">
      <h2 className="text-2xl font-bold">Sincronizar Pedidos Agora</h2>

      <p className="mt-2 text-sm text-slate-400">
        Dispara o ciclo manualmente (sem esperar o cron) e mostra exatamente o
        que a Shopee respondeu. Útil para testar a integração.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <label className="text-sm text-slate-300">
          Últimos
          <select
            value={dias}
            onChange={(e) => setDias(Number(e.target.value))}
            disabled={loading}
            className="mx-2 rounded-lg bg-slate-800 px-3 py-2 text-white"
          >
            <option value={1}>1 dia</option>
            <option value={3}>3 dias</option>
            <option value={7}>7 dias</option>
            <option value={15}>15 dias (máx.)</option>
          </select>
        </label>

        <button
          onClick={sincronizar}
          disabled={loading || !lojaId}
          className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
        >
          {loading ? "Sincronizando..." : "Sincronizar Pedidos Agora"}
        </button>
      </div>

      {resultado && (
        <div className="mt-5 space-y-3">
          <div
            className={`rounded-xl px-4 py-3 text-sm font-semibold ${
              resultado.sucesso
                ? "bg-green-900 text-green-200"
                : "bg-red-900 text-red-200"
            }`}
          >
            {resultado.mensagem || resultado.erro || "Sem mensagem."}
          </div>

          {typeof resultado.totalPedidos === "number" && (
            <p className="text-sm text-slate-300">
              Lotes processados: {resultado.lotesProcessados ?? 0} • Pedidos
              gravados: {resultado.totalPedidos}
            </p>
          )}

          {resultado.resultados && resultado.resultados.length > 0 && (
            <details className="rounded-xl bg-slate-800 p-4">
              <summary className="cursor-pointer text-sm font-semibold text-slate-200">
                Detalhes técnicos (retorno da Shopee)
              </summary>

              <div className="mt-3 space-y-3">
                {resultado.resultados.map((r) => (
                  <div key={r.jobId} className="rounded-lg bg-slate-900 p-3">
                    <p className="text-xs text-slate-400">
                      Lote {r.jobId} — {r.status} — {r.total} pedidos
                    </p>
                    <p className="mt-1 text-sm text-slate-200">{r.mensagem}</p>
                    {r.debugPrimeiroRetorno != null && (
                      <pre className="mt-2 max-h-64 overflow-auto rounded bg-black/40 p-2 text-xs text-slate-300">
                        {JSON.stringify(r.debugPrimeiroRetorno, null, 2)}
                      </pre>
                    )}
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
