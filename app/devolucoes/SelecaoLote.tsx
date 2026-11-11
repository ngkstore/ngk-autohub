"use client";

import { useState, type ReactNode } from "react";
import { Botao } from "../components/ui";

// Seleção em lote da fila: "Aplicar sugestões selecionadas" manda cada caso para a
// aprovação no Telegram (nada é enviado à plataforma sem aprovação).
export default function SelecaoLote({ ids, children }: { ids: string[]; children: ReactNode }) {
  const [sel, setSel] = useState<string[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const todos = ids.length > 0 && sel.length === ids.length;

  async function aplicar() {
    setOcupado(true);
    setMsg(null);
    const r = await fetch("/api/devolucoes/lote", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: sel }) });
    const d = await r.json();
    setMsg(d.sucesso ? `${d.pedidas} pedido(s) de aprovação enviados ao Telegram.` : d.erro || "Erro.");
    setOcupado(false);
  }

  return (
    <div>
      <div className="flex items-center gap-3 border-t border-borda px-[18px] py-2 text-[13px]">
        <label className="flex items-center gap-2 text-texto-2">
          <input type="checkbox" checked={todos} onChange={(e) => setSel(e.target.checked ? ids : [])} disabled={ids.length === 0} />
          {sel.length ? `${sel.length} selecionada(s)` : ids.length ? `${ids.length} com sugestão` : "nenhuma com sugestão"}
        </label>
        <Botao pequeno variante="principal" disabled={sel.length === 0 || ocupado} onClick={aplicar}>
          {ocupado ? "Enviando…" : "Aplicar sugestões selecionadas"}
        </Botao>
        {msg && <span className="text-xs text-texto-2">{msg}</span>}
      </div>
      {children}
    </div>
  );
}
