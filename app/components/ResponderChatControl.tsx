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
  autonomo?: boolean;
  enviados?: number;
  escalados?: number;
  propostas?: Proposta[];
};

export default function ResponderChatControl() {
  const [ativo, setAtivo] = useState<boolean | null>(null);
  const [autonomo, setAutonomo] = useState<boolean | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [salvandoAuto, setSalvandoAuto] = useState(false);
  const [rodando, setRodando] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);

  useEffect(() => {
    fetch("/api/shopee/chat/auto")
      .then((r) => r.json())
      .then((d) => {
        setAtivo(!!d.ativo);
        setAutonomo(!!d.autonomo);
      })
      .catch(() => {
        setAtivo(false);
        setAutonomo(false);
      });
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
      setAutonomo(!!d.autonomo);
    } finally {
      setSalvando(false);
    }
  }

  async function alternarAutonomo() {
    setSalvandoAuto(true);
    try {
      const r = await fetch("/api/shopee/chat/auto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ autonomo: !autonomo }),
      });
      const d = await r.json();
      setAtivo(!!d.ativo);
      setAutonomo(!!d.autonomo);
    } finally {
      setSalvandoAuto(false);
    }
  }

  async function rodar(enviar: boolean) {
    setRodando(true);
    setResultado(null);
    try {
      const r = await fetch("/api/shopee/chat/responder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limite: 5, enviar, autonomo: !!autonomo }),
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
    <div className="rounded-2xl border border-primaria bg-superficie p-6">
      <h2 className="text-2xl font-bold">Atendimento do Chat (robô)</h2>

      <p className="mt-2 text-sm text-texto-2">
        Responde dúvidas de produto com base na descrição + suas respostas
        anteriores. Defeito/reclamação e casos sem certeza são escalados pra
        você. Comece em &quot;Gerar sem enviar&quot; para revisar o tom.
      </p>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <span className="text-sm text-texto">Robô automático:</span>
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ${
            ativo ? "bg-chip-verde-fundo text-sucesso" : "bg-chip-cinza-fundo text-texto"
          }`}
        >
          {ativo === null ? "..." : ativo ? "LIGADO" : "DESLIGADO"}
        </span>

        <button
          onClick={alternar}
          disabled={salvando || ativo === null}
          className={`rounded-xl px-4 py-2 text-sm font-semibold text-texto disabled:opacity-50 ${
            ativo ? "bg-perigo hover:bg-perigo" : "bg-sucesso hover:bg-sucesso"
          }`}
        >
          {salvando ? "Salvando..." : ativo ? "Desligar" : "Ligar"}
        </button>

        <button
          onClick={() => rodar(false)}
          disabled={rodando}
          className="rounded-xl bg-chip-cinza-fundo px-4 py-2 text-sm font-semibold text-texto hover:bg-superficie-2 disabled:opacity-50"
        >
          {rodando ? "..." : "Gerar sem enviar (revisar 5)"}
        </button>

        <button
          onClick={() => rodar(true)}
          disabled={rodando}
          className="rounded-xl bg-primaria px-4 py-2 text-sm font-semibold text-texto hover:bg-primaria-hover disabled:opacity-50"
        >
          {rodando ? "..." : "Responder de verdade (5)"}
        </button>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-borda pt-5">
        <span className="text-sm text-texto">Modo 100% autônomo:</span>
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ${
            autonomo ? "bg-chip-amarelo-fundo text-alerta" : "bg-chip-cinza-fundo text-texto"
          }`}
        >
          {autonomo === null ? "..." : autonomo ? "LIGADO" : "DESLIGADO"}
        </span>

        <button
          onClick={alternarAutonomo}
          disabled={salvandoAuto || autonomo === null}
          className={`rounded-xl px-4 py-2 text-sm font-semibold text-texto disabled:opacity-50 ${
            autonomo
              ? "bg-perigo hover:bg-perigo"
              : "bg-alerta hover:bg-alerta"
          }`}
        >
          {salvandoAuto ? "Salvando..." : autonomo ? "Desligar autônomo" : "Ligar autônomo"}
        </button>

        <p className="w-full text-xs text-texto-2">
          Quando ligado, o robô responde <strong>todas</strong> as conversas
          (nunca escala): se não houver uma dúvida clara, manda uma saudação
          curta só para manter a taxa de resposta da Shopee. Os botões de teste
          acima já usam este modo.
        </p>
      </div>

      {resultado && (
        <div className="mt-5">
          {resultado.erro ? (
            <div className="rounded-xl bg-chip-vermelho-fundo px-4 py-3 text-sm text-perigo">
              {resultado.erro}
            </div>
          ) : (
            <>
              <p className="text-sm text-texto">
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
                    className="rounded-xl bg-superficie-2 p-4"
                  >
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="text-texto-2">
                        {p.cliente || "cliente"}
                      </span>
                      <span className="rounded-full bg-chip-cinza-fundo px-2 py-0.5 text-texto">
                        {p.categoria}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 ${
                          p.acao === "escalar"
                            ? "bg-chip-amarelo-fundo text-alerta"
                            : "bg-chip-verde-fundo text-sucesso"
                        }`}
                      >
                        {p.acao === "escalar" ? "escalar p/ humano" : "responder"}
                      </span>
                      <span className="text-texto-2">
                        confiança: {p.confianca}
                      </span>
                    </div>

                    <p className="mt-2 text-sm text-texto-2">
                      <strong>Cliente:</strong> {p.pergunta}
                    </p>
                    <p className="mt-1 text-sm text-texto">
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
