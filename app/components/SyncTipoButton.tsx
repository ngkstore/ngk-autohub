"use client";

import { useState } from "react";

type Props = {
  tipo: "produtos" | "pedidos" | "avaliacoes" | "financeiro" | "geral";
  label: string;
};

export default function SyncTipoButton({
  tipo,
  label,
}: Props) {
  const [loading, setLoading] = useState(false);

  async function sincronizar() {
    try {
      setLoading(true);

      let endpoint = "/api/sincronizar";

      if (tipo === "produtos") {
        endpoint =
          "/api/shopee/produtos/sincronizar";
      }

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tipo,
          marketplace: "shopee",
        }),
      });

      const resultado = await response.json();

      if (resultado.sucesso) {
        alert(
          resultado.mensagem ||
            "Sincronização executada com sucesso."
        );

        location.reload();
      } else {
        alert(
          resultado.erro ||
            "Erro ao sincronizar."
        );
      }
    } catch (error) {
      console.error(error);

      alert(
        "Erro ao executar sincronização."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={sincronizar}
      disabled={loading}
      className="rounded-xl bg-blue-600 px-5 py-4 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
    >
      {loading
        ? "Sincronizando..."
        : label}
    </button>
  );
}