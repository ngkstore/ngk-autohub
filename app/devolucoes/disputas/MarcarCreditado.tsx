"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Botao } from "../../components/ui";

type Cand = { ref: string; tipo: string | null; categoria: string | null; valor: number | null; quando: string | null; descricao: string | null };

// B6 — "Cobrar a plataforma · texto pronto" e "Marcar como creditado" escolhendo a transação.
export default function MarcarCreditado({ id, textoCobranca }: { id: string; textoCobranca: string }) {
  const router = useRouter();
  const [cands, setCands] = useState<Cand[]>([]);
  const [ref, setRef] = useState("");
  const [mostrarTexto, setMostrarTexto] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/devolucoes/${id}/credito`)
      .then((r) => r.json())
      .then((d) => setCands(d.candidatas || []))
      .catch(() => setCands([]));
  }, [id]);

  async function marcar() {
    const c = cands.find((x) => x.ref === ref);
    if (!c) return;
    setOcupado(true);
    const r = await fetch(`/api/devolucoes/${id}/credito`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ transacao_ref: c.ref, valor: c.valor, tipo: c.tipo }) });
    const d = await r.json();
    setMsg(d.sucesso ? `Marcado. Tipo da transação: ${c.tipo ?? "?"} (candidato para carteira_categorias).` : d.erro || "Erro.");
    setOcupado(false);
    router.refresh();
  }

  return (
    <div className="mt-2 space-y-2 text-xs">
      <div className="flex flex-wrap gap-2">
        <Botao pequeno onClick={() => setMostrarTexto((v) => !v)}>
          Cobrar a plataforma · texto pronto
        </Botao>
      </div>
      {mostrarTexto && <textarea readOnly value={textoCobranca} rows={6} className="w-full rounded-lg border border-borda bg-superficie-2 p-2 text-xs text-texto" onFocus={(e) => e.currentTarget.select()} />}
      <div className="flex flex-wrap items-center gap-2">
        <select value={ref} onChange={(e) => setRef(e.target.value)} className="h-8 max-w-full rounded-lg border border-borda bg-superficie px-2 text-xs text-texto">
          <option value="">Transação do pedido…</option>
          {cands.map((c) => (
            <option key={c.ref} value={c.ref}>
              {c.quando ? new Date(c.quando).toLocaleDateString("pt-BR") : "?"} · {c.tipo ?? "?"} · R$ {Number(c.valor || 0).toFixed(2)}
            </option>
          ))}
        </select>
        <Botao pequeno variante="principal" disabled={!ref || ocupado} onClick={marcar}>
          Marcar como creditado
        </Botao>
      </div>
      {cands.length === 0 && <p className="text-texto-2">Nenhuma transação ligada a este pedido na carteira/extrato ainda.</p>}
      {msg && <p className="text-texto">{msg}</p>}
    </div>
  );
}
