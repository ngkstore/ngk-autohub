"use client";

import { useState } from "react";

const LIMITE_POR_CICLO = 300;

export default function EnriquecerPedidosButton() {
  const [loading, setLoading] = useState(false);
  const [progresso, setProgresso] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function enriquecer() {
    setLoading(true);
    setErro(null);
    setProgresso("Iniciando...");

    let totalEnriquecidos = 0;

    try {
      // Roda em ciclos até não sobrar pendente (ou parar de progredir).
      while (true) {
        const response = await fetch(
          "/api/shopee/pedidos/enriquecer-detalhes",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ limite: LIMITE_POR_CICLO }),
          }
        );

        const texto = await response.text();

        let data: {
          sucesso: boolean;
          erro?: string;
          atualizados?: number;
          restantes?: number;
          processados?: number;
          mensagemErro?: string;
        };

        try {
          data = JSON.parse(texto);
        } catch {
          throw new Error(
            `Falha no servidor (HTTP ${response.status}): ${texto.slice(0, 300)}`
          );
        }

        if (!data.sucesso) {
          throw new Error(data.erro || "Erro ao enriquecer.");
        }

        totalEnriquecidos += data.atualizados ?? 0;
        const restantes = data.restantes ?? 0;

        setProgresso(
          `Enriquecidos ${totalEnriquecidos} pedido(s). Faltam ${restantes}.`
        );

        // Acabou, ou esse ciclo não conseguiu avançar (evita loop infinito).
        if (restantes === 0 || (data.processados ?? 0) === 0) {
          if (data.mensagemErro && restantes > 0) {
            setErro(
              `Parou com ${restantes} pendente(s). Último erro: ${data.mensagemErro}`
            );
          }
          break;
        }

        if ((data.atualizados ?? 0) === 0) {
          setErro(
            `Parou: ${restantes} pedido(s) não retornaram detalhe. ${
              data.mensagemErro ? `Erro: ${data.mensagemErro}` : ""
            }`
          );
          break;
        }
      }

      setProgresso(`Concluído! ${totalEnriquecidos} pedido(s) enriquecido(s).`);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao enriquecer pedidos.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-2xl border border-sky-800 bg-slate-900 p-6">
      <h2 className="text-2xl font-bold">Enriquecer Pedidos</h2>

      <p className="mt-2 text-sm text-slate-400">
        Busca os detalhes (valor, cliente, itens e data) dos pedidos já
        importados. Roda em ciclos automáticos até concluir.
      </p>

      <button
        onClick={enriquecer}
        disabled={loading}
        className="mt-4 rounded-xl bg-sky-600 px-5 py-3 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-50"
      >
        {loading ? "Enriquecendo..." : "Enriquecer Pedidos"}
      </button>

      {progresso && (
        <p className="mt-4 text-sm text-slate-200">{progresso}</p>
      )}

      {erro && (
        <div className="mt-3 rounded-xl bg-red-900 px-4 py-3 text-sm text-red-200">
          {erro}
        </div>
      )}
    </div>
  );
}
