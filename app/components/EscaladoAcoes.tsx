"use client";

import { useState } from "react";

type Props = {
  conversationId: string;
  marketplace?: string;
  sugestao: string;
};

export default function EscaladoAcoes({
  conversationId,
  marketplace = "shopee",
  sugestao,
}: Props) {
  const [texto, setTexto] = useState(sugestao || "");
  const [loading, setLoading] = useState<"enviar" | "resolver" | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function agir(acao: "enviar" | "resolver") {
    setLoading(acao);
    setMsg(null);
    try {
      const r = await fetch("/api/shopee/chat/acao", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversation_id: conversationId,
          marketplace,
          acao,
          texto,
        }),
      });
      const d = await r.json();
      if (d.sucesso) {
        setMsg(acao === "enviar" ? "Enviado! ✅" : "Resolvido ✅");
        setTimeout(() => location.reload(), 800);
      } else {
        setMsg(d.erro || "Erro.");
      }
    } catch {
      setMsg("Erro ao executar.");
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="mt-3">
      <textarea
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        rows={3}
        placeholder="Resposta a enviar ao cliente..."
        className="w-full rounded-lg border border-borda bg-fundo p-3 text-sm text-texto"
      />

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          onClick={() => agir("enviar")}
          disabled={loading !== null || !texto.trim()}
          className="rounded-lg bg-primaria px-4 py-2 text-sm font-semibold text-texto hover:bg-primaria-hover disabled:opacity-50"
        >
          {loading === "enviar" ? "Enviando..." : "Enviar resposta"}
        </button>

        <button
          onClick={() => agir("resolver")}
          disabled={loading !== null}
          className="rounded-lg bg-chip-cinza-fundo px-4 py-2 text-sm font-semibold text-texto hover:bg-chip-cinza-fundo disabled:opacity-50"
        >
          {loading === "resolver" ? "..." : "Marcar como resolvido"}
        </button>

        {msg && <span className="text-sm text-texto">{msg}</span>}
      </div>
    </div>
  );
}
