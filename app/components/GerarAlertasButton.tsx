"use client";

import { useState } from "react";

export default function GerarAlertasButton() {
  const [loading, setLoading] = useState(false);

  async function gerarAlertas() {
    try {
      setLoading(true);

      const response = await fetch("/api/alertas/gerar", {
        method: "POST",
      });

      const resultado = await response.json();

      if (resultado.sucesso) {
        alert("Alertas gerados com sucesso.");
        location.reload();
      } else {
        alert(resultado.erro || "Erro ao gerar alertas.");
      }
    } catch (error) {
      console.error(error);
      alert("Erro ao gerar alertas.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={gerarAlertas}
      disabled={loading}
      className="rounded-lg bg-red-600 px-5 py-3 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-50"
    >
      {loading ? "Gerando..." : "Gerar Alertas"}
    </button>
  );
}