"use client";

import { useState } from "react";

type Props = {
  lojaId: string;
  marketplace: string;
};

export default function SyncButton({
  lojaId,
  marketplace,
}: Props) {
  const [loading, setLoading] = useState(false);

  async function sincronizar() {
    try {
      setLoading(true);

      let endpoint = "/api/sincronizar";

      if (marketplace === "shopee") {
        endpoint =
          "/api/shopee/produtos/sincronizar";
      }

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          lojaId,
          marketplace,
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
      className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
    >
      {loading
        ? "Sincronizando..."
        : "Sincronizar Agora"}
    </button>
  );
}