"use client";

import { useState } from "react";

export default function SincronizarChatButton() {
  const [loading, setLoading] = useState(false);
  const [resultado, setResultado] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function sincronizar() {
    setLoading(true);
    setErro(null);
    setResultado(null);
    try {
      const r = await fetch("/api/shopee/chat/sincronizar", { method: "POST" });
      const texto = await r.text();
      let data: {
        sucesso: boolean;
        erro?: string;
        conversas?: number;
        mensagens?: number;
      };
      try {
        data = JSON.parse(texto);
      } catch {
        throw new Error(`Falha no servidor (HTTP ${r.status}): ${texto.slice(0, 200)}`);
      }
      if (!data.sucesso) throw new Error(data.erro || "Erro ao sincronizar chat.");
      setResultado(
        `${data.conversas ?? 0} conversa(s) e ${data.mensagens ?? 0} mensagem(ns) sincronizadas.`
      );
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao sincronizar chat.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-2xl border border-teal-800 bg-slate-900 p-6">
      <h2 className="text-2xl font-bold">Sincronizar Chat</h2>

      <p className="mt-2 text-sm text-slate-400">
        Puxa agora as conversas mais recentes do chat (mensagens novas dos
        clientes). O histórico antigo é puxado em segundo plano pelo cron.
      </p>

      <button
        onClick={sincronizar}
        disabled={loading}
        className="mt-4 rounded-xl bg-teal-600 px-5 py-3 text-sm font-semibold text-white hover:bg-teal-500 disabled:opacity-50"
      >
        {loading ? "Sincronizando..." : "Sincronizar Chat agora"}
      </button>

      {resultado && <p className="mt-4 text-sm text-slate-200">{resultado}</p>}
      {erro && (
        <div className="mt-3 rounded-xl bg-red-900 px-4 py-3 text-sm text-red-200">
          {erro}
        </div>
      )}
    </div>
  );
}
