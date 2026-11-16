"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Botao } from "../components/ui";

// Fase 1: só registra a decisão no AutoHub (nada vai para o TikTok).
export default function DecidirAmostra({ lojaId, amostraId, decisao }: { lojaId: string; amostraId: string; decisao: string | null }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const enviar = async (d: "aprovar" | "recusar" | "adiar") => {
    setOcupado(true);
    setErro(null);
    try {
      const r = await fetch("/api/creators/decidir", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ loja_id: lojaId, amostra_id: amostraId, decisao: d }) });
      const j = await r.json();
      if (!j.sucesso) throw new Error(j.erro || "Falhou");
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setOcupado(false);
    }
  };
  if (decisao) return <span className="text-xs text-texto-2">registrado: {decisao}</span>;
  return (
    <div className="flex flex-wrap items-center gap-1">
      <Botao pequeno variante="principal" onClick={() => enviar("aprovar")} disabled={ocupado}>Aprovar</Botao>
      <Botao pequeno onClick={() => enviar("recusar")} disabled={ocupado}>Recusar</Botao>
      <Botao pequeno onClick={() => enviar("adiar")} disabled={ocupado}>Adiar</Botao>
      {erro && <span className="text-xs text-perigo">{erro}</span>}
    </div>
  );
}
