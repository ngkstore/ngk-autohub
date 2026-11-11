"use client";

import { useState } from "react";
import { classesBotao } from "./ui/Botao";

export default function GerarRankingButton() {
  const [loading, setLoading] = useState(false);

  async function gerarRanking() {
    try {
      setLoading(true);

      const response = await fetch("/api/ranking/gerar", {
        method: "POST",
      });

      const resultado = await response.json();

      if (resultado.sucesso) {
        alert("Ranking gerado com sucesso.");
        location.reload();
      } else {
        alert(resultado.erro || "Erro ao gerar ranking.");
      }
    } catch (error) {
      console.error(error);
      alert("Erro ao gerar ranking.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={gerarRanking}
      disabled={loading}
      className={classesBotao("secundario")}
    >
      {loading ? "Gerando ranking..." : "Gerar Ranking"}
    </button>
  );
}