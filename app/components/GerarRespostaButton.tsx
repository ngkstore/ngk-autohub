"use client";

import { useState } from "react";

export default function GerarRespostaButton({ avaliacao }: { avaliacao: any }) {
  const [carregando, setCarregando] = useState(false);

  async function gerarResposta() {
    setCarregando(true);

    await fetch("/api/gerar-resposta", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(avaliacao),
    });

    window.location.reload();
  }

  return (
    <button
      onClick={gerarResposta}
      disabled={carregando}
      className="bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded-lg font-semibold"
    >
      {carregando ? "Gerando..." : "Gerar IA"}
    </button>
  );
}