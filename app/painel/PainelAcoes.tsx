"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Botao } from "../components/ui";

export default function PainelAcoes({ admin }: { admin: boolean }) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  async function resumo() {
    setOcupado(true);
    const r = await fetch("/api/painel", { method: "POST" });
    const d = await r.json();
    setMsg(d.enviado ? "Resumo enviado ao Telegram." : d.motivo || d.erro || "Não enviado.");
    setOcupado(false);
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Botao onClick={() => router.refresh()}>Atualizar</Botao>
      {admin && (
        <Botao variante="principal" disabled={ocupado} onClick={resumo}>
          {ocupado ? "Enviando…" : "Enviar resumo no Telegram"}
        </Botao>
      )}
      {msg && <span className="text-xs text-texto-2">{msg}</span>}
    </div>
  );
}
