"use client";

import { useState } from "react";

const LIMITE_POR_CICLO = 150;

export default function EnriquecerFinanceiroButton() {
  const [loading, setLoading] = useState(false);
  const [progresso, setProgresso] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function conciliar() {
    setLoading(true);
    setErro(null);
    setProgresso("Iniciando...");

    let totalConciliados = 0;

    try {
      while (true) {
        const response = await fetch(
          "/api/shopee/pedidos/enriquecer-financeiro",
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
          throw new Error(data.erro || "Erro ao conciliar.");
        }

        totalConciliados += data.atualizados ?? 0;
        const restantes = data.restantes ?? 0;

        setProgresso(
          `Conciliados ${totalConciliados} pedido(s). Faltam ${restantes}.`
        );

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
            `Parou: ${restantes} pedido(s) sem retorno do escrow. ${
              data.mensagemErro ? `Erro: ${data.mensagemErro}` : ""
            }`
          );
          break;
        }
      }

      setProgresso(`Concluído! ${totalConciliados} pedido(s) conciliado(s).`);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao conciliar pedidos.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-2xl border border-violet-800 bg-slate-900 p-6">
      <h2 className="text-2xl font-bold">Conciliar Financeiro (Shopee)</h2>

      <p className="mt-2 text-sm text-slate-400">
        Busca o detalhamento financeiro (escrow) de cada pedido: valor pago,
        cupons, taxas e o valor líquido a receber. Ajusta as Vendas para bater
        com o &quot;Pedidos Pagos&quot; do Shopee. Roda em ciclos até concluir.
      </p>

      <button
        onClick={conciliar}
        disabled={loading}
        className="mt-4 rounded-xl bg-violet-600 px-5 py-3 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
      >
        {loading ? "Conciliando..." : "Conciliar Financeiro"}
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
