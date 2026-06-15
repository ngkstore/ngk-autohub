"use client";

import { useState } from "react";

type Loja = {
  id: string;
  apelido: string;
  marketplace: string;
};

type Props = {
  lojas: Loja[];
};

function normalizarMarketplace(marketplace?: string) {
  const valor = marketplace?.toLowerCase() || "";

  if (valor.includes("shopee")) {
    return "shopee";
  }

  if (valor.includes("tiktok")) {
    return "tiktok";
  }

  return valor;
}

export default function SyncAllButton({ lojas }: Props) {
  const [loading, setLoading] = useState(false);

  async function sincronizarTudo() {
    try {
      setLoading(true);

      let sucesso = 0;
      let erros = 0;

      for (const loja of lojas) {
        const marketplace = normalizarMarketplace(loja.marketplace);

        const response = await fetch("/api/sincronizar", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            lojaId: loja.id,
            marketplace,
          }),
        });

        const resultado = await response.json();

        if (resultado.sucesso) {
          sucesso++;
        } else {
          erros++;
        }
      }

      alert(
        `Sincronização concluída.\nSucesso: ${sucesso}\nErros: ${erros}`
      );

      location.reload();
    } catch (error) {
      console.error(error);
      alert("Erro ao sincronizar todas as lojas.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={sincronizarTudo}
      disabled={loading || lojas.length === 0}
      className="rounded-lg bg-green-600 px-5 py-3 text-sm font-semibold text-white hover:bg-green-500 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {loading ? "Sincronizando tudo..." : "Sincronizar Tudo"}
    </button>
  );
}