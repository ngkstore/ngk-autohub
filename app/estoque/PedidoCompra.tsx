"use client";

import { useState } from "react";
import { Botao } from "../components/ui";

type Sug = { sku: string; nome: string | null; fornecedor: string | null; quantidade: number; caixa: number | null; custo: number | null };

// D4 — "Gerar pedido de compra": lista sugerida por fornecedor em CSV para lançar no UpSeller.
// Nada é enviado automaticamente.
export default function PedidoCompra({ sugestoes }: { sugestoes: Sug[] }) {
  const [aberto, setAberto] = useState(false);
  const porFornecedor = new Map<string, Sug[]>();
  for (const s of sugestoes) porFornecedor.set(s.fornecedor ?? "Sem fornecedor", [...(porFornecedor.get(s.fornecedor ?? "Sem fornecedor") || []), s]);

  function baixar(fornecedor?: string) {
    const lista = fornecedor ? porFornecedor.get(fornecedor) || [] : sugestoes;
    const linhas = [["Fornecedor", "SKU", "Produto", "Quantidade", "Caixas", "Custo unit.", "Total"], ...lista.map((s) => [s.fornecedor ?? "", s.sku, s.nome ?? "", String(s.quantidade), s.caixa ? String(Math.ceil(s.quantidade / s.caixa)) : "", s.custo != null ? String(s.custo).replace(".", ",") : "", s.custo != null ? String(Math.round(s.custo * s.quantidade * 100) / 100).replace(".", ",") : ""])];
    const csv = "﻿" + linhas.map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = `pedido-compra-${(fornecedor || "todos").replace(/\s+/g, "-").toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  }

  return (
    <div className="relative">
      <Botao variante="principal" onClick={() => setAberto((v) => !v)} disabled={sugestoes.length === 0}>
        Gerar pedido de compra{sugestoes.length ? ` (${sugestoes.length})` : ""}
      </Botao>
      {aberto && (
        <div className="absolute right-0 top-full z-20 mt-1 min-w-72 rounded-lg border border-borda bg-superficie p-2 shadow-cartao">
          <p className="px-2 py-1 text-xs text-texto-2">Planilha para lançar no UpSeller (nada é enviado automaticamente).</p>
          {[...porFornecedor.entries()].map(([f, l]) => (
            <button key={f} type="button" onClick={() => baixar(f)} className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-[13px] text-texto hover:bg-superficie-2">
              <span>{f}</span>
              <span className="text-xs text-texto-2">{l.length} SKU(s) · {l.reduce((s, x) => s + x.quantidade, 0)} un.</span>
            </button>
          ))}
          <button type="button" onClick={() => baixar()} className="mt-1 w-full rounded-md bg-primaria-suave px-2 py-1.5 text-[13px] font-medium text-primaria-texto">
            Baixar tudo
          </button>
        </div>
      )}
    </div>
  );
}
