"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

// Upload da planilha de estoque -> importa custos por variação (custos_variacao).
export default function UploadCustos() {
  const [estado, setEstado] = useState<"idle" | "enviando" | "ok" | "erro">("idle");
  const [msg, setMsg] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  async function enviar(file: File) {
    setEstado("enviando");
    setMsg(`Lendo ${file.name}…`);
    const fd = new FormData();
    fd.append("arquivo", file);
    try {
      const r = await fetch("/api/produtos/custos-upload", { method: "POST", body: fd });
      const d = await r.json();
      if (d.sucesso) {
        setEstado("ok");
        setMsg(`${d.skus} custos de variação importados. Atualizando a lista…`);
        router.refresh();
      } else {
        setEstado("erro");
        setMsg(d.erro || "Falha ao importar.");
      }
    } catch {
      setEstado("erro");
      setMsg("Erro de rede ao enviar.");
    }
  }

  return (
    <div className="mb-5 rounded-2xl border border-slate-800 bg-slate-900 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold text-white">📥 Importar planilha de estoque</h3>
          <p className="mt-1 text-sm text-slate-400">
            Sobe o arquivo (.xlsx ou .csv) com as colunas <b>SKU</b> e <b>Custo</b> — o sistema grava o custo de
            cada variação automaticamente.
          </p>
        </div>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={estado === "enviando"}
          className="rounded-xl bg-emerald-600 px-5 py-2.5 font-medium text-white transition hover:bg-emerald-500 disabled:opacity-60"
        >
          {estado === "enviando" ? "Importando…" : "Escolher arquivo"}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) enviar(f);
            e.target.value = "";
          }}
        />
      </div>
      {msg && (
        <p className={`mt-3 text-sm ${estado === "ok" ? "text-emerald-400" : estado === "erro" ? "text-red-400" : "text-slate-400"}`}>
          {estado === "ok" ? "✓ " : estado === "erro" ? "✗ " : "… "}
          {msg}
        </p>
      )}
    </div>
  );
}
