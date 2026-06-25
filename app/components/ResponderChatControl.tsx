"use client";

import { useEffect, useState } from "react";

type Proposta = {
  conversation_id: string;
  cliente: string | null;
  pergunta: string;
  categoria: string;
  confianca: string;
  acao: "responder" | "escalar";
  resposta: string;
};

type Resultado = {
  sucesso: boolean;
  erro?: string;
  enviar?: boolean;
  enviados?: number;
  escalados?: number;
  propostas?: Proposta[];
};

export default function ResponderChatControl() {
  const [ativo, setAtivo] = useState<boolean | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [rodando, setRodando] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);

  useEffect(() => {
    fetch("/api/shopee/chat/auto")
      .then((r) => r.json())
      .then((d) => setAtivo(!!d.ativo))
      .catch(() => setAtivo(false));
  }, []);

  async function alternar() {
    setSalvando(true);
    try {
      const r = await fetch("/api/shopee/chat/auto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ativo: !ativo }),
      });
      const d = await r.json();
      setAtivo(!!d.ativo);
    } finally {
      setSalvando(false);
    }
  }

  async function rodar(enviar: boolean) {
    setRodando(true);
    setResultado(null);
    try {
      const r = await fetch("/api/shopee/chat/responder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limite: 5, enviar }),
      });
      const texto = await r.text();
      try {
        setResultado(JSON.parse(texto));
      } catch {
        setResultado({
          sucesso: false,
          erro: `Falha no servidor (HTTP ${r.status}): ${texto.slice(0, 300)}`,
        });
      }
    } catch (e) {
      setResultado({
        sucesso: false,
        erro: e instanceof Error ? e.message : "Erro ao rodar.",
      });
    } finally {
      setRodando(false);
    }
  }

  return (
    <div className="rounded-2xl border border-cyan-800 bg-slate-900 p-6">
      <h2 className="text-2xl font-bold">Atendimento do Chat (robô)</h2>

      <p className="mt-2 text-sm text-slate-400">
        Responde dúvidas de produto com base na descrição + suas respostas
        anteriores. Defeito/reclamação e casos sem certeza são escalados pra
        você. Comece em &quot;Gerar sem enviar&quot; para revisar o tom.
      </p>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <span className="text-sm text-slate-300">Robô automático:</span>
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ${
            ativo ? "bg-green-900 text-green-300" : "bg-slate-700 text-slate-300"
          }`}
        >
          {ativo === null ? "..." : ativo ? "LIGADO" : "DESLIGADO"}
        </span>

        <button
          onClick={alternar}
          disabled={salvando || ativo === null}
          className={`rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 ${
            ativo ? "bg-red-700 hover:bg-red-600" : "bg-green-700 hover:bg-green-600"
          }`}
        >
          {salvando ? "Salvando..." : ativo ? "Desligar" : "Ligar"}
        </button>

        <button
          onClick={() => rodar(false)}
          disabled={rodando}
          className="rounded-xl bg-slate-600 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-500 disabled:opacity-50"
        >
          {rodando ? "..." : "Gerar sem enviar (revisar 5)"}
        </button>

        <button
          onClick={() => rodar(true)}
          disabled={rodando}
          className="rounded-xl bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-500 disabled:opacity-50"
        >
          {rodando ? "..." : "Responder de verdade (5)"}
        </button>
      </div>

      {resultado && (
        <div className="mt-5">
          {resultado.erro ? (
            <div className="rounded-xl bg-red-900 px-4 py-3 text-sm text-red-200">
              {resultado.erro}
            </div>
          ) : (
            <>
              <p className="text-sm text-slate-300">
                {resultado.enviar
                  ? `Enviadas: ${resultado.enviados ?? 0} • Escaladas: ${
                      resultado.escalados ?? 0
                    }`
                  : `${resultado.propostas?.length ?? 0} resposta(s) proposta(s) (revisão — nada foi enviado)`}
              </p>

              <div className="mt-3 space-y-3">
                {(resultado.propostas || []).map((p) => (
                  <div
                    key={p.conversation_id}
                    className="rounded-xl bg-slate-800 p-4"
                  >
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="text-slate-400">
                        {p.cliente || "cliente"}
                      </span>
                      <span className="rounded-full bg-slate-700 px-2 py-0.5 text-slate-200">
                        {p.categoria}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 ${
                          p.acao === "escalar"
                            ? "bg-yellow-900 text-yellow-300"
                            : "bg-green-900 text-green-300"
                        }`}
                      >
                        {p.acao === "escalar" ? "escalar p/ humano" : "responder"}
                      </span>
                      <span className="text-slate-500">
                        confiança: {p.confianca}
                      </span>
                    </div>

                    <p className="mt-2 text-sm text-slate-400">
                      <strong>Cliente:</strong> {p.pergunta}
                    </p>
                    <p className="mt-1 text-sm text-slate-100">
                      <strong>Resposta:</strong> {p.resposta || "—"}
                    </p>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
