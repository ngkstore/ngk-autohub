"use client";

import { useState } from "react";

export default function GerarTodasButton() {
  const [carregando, setCarregando] = useState(false);

  async function gerarTodas() {
    setCarregando(true);

    await fetch("/api/gerar-todas-respostas", {
      method: "POST",
    });

    window.location.reload();
  }

  return (
    <button
      onClick={gerarTodas}
      disabled={carregando}
      className="rounded-lg bg-orange-600 px-4 py-2 font-semibold hover:bg-orange-500 disabled:opacity-50"
    >
      {carregando ? "Gerando todas..." : "Gerar todas pendentes"}
    </button>
  );
}