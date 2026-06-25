"use client";

import { useState } from "react";

type Props = {
  conversationId: string;
  sugestao: string;
};

export default function EscaladoAcoes({ conversationId, sugestao }: Props) {
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
        body: JSON.stringify({ conversation_id: conversationId, acao, texto }),
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
        className="w-full rounded-lg border border-slate-700 bg-slate-950 p-3 text-sm text-white"
      />

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          onClick={() => agir("enviar")}
          disabled={loading !== null || !texto.trim()}
          className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-500 disabled:opacity-50"
        >
          {loading === "enviar" ? "Enviando..." : "Enviar resposta"}
        </button>

        <button
          onClick={() => agir("resolver")}
          disabled={loading !== null}
          className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-600 disabled:opacity-50"
        >
          {loading === "resolver" ? "..." : "Marcar como resolvido"}
        </button>

        {msg && <span className="text-sm text-slate-300">{msg}</span>}
      </div>
    </div>
  );
}
