"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";

type Loja = { id: string; apelido: string };
type Linha = Record<string, unknown>;

export default function ImportarInsights() {
  const router = useRouter();
  const [lojas, setLojas] = useState<Loja[]>([]);
  const [lojaId, setLojaId] = useState("");
  const [periodoInicio, setPeriodoInicio] = useState("");
  const [periodoFim, setPeriodoFim] = useState("");
  const [arquivo, setArquivo] = useState("");
  const [colunas, setColunas] = useState<string[]>([]);
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [erro, setErro] = useState("");
  const [importando, setImportando] = useState(false);
  const [ok, setOk] = useState("");

  useEffect(() => {
    fetch("/api/minhas-lojas")
      .then((r) => r.json())
      .then((d) => setLojas(d.lojas || []))
      .catch(() => setLojas([]));
  }, []);

  async function aoEscolherArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    setErro("");
    setOk("");
    const file = e.target.files?.[0];
    if (!file) return;
    setArquivo(file.name);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Linha>(ws, { defval: "" });
      if (rows.length === 0) {
        setErro("Não encontrei linhas na planilha (confira a 1ª aba/cabeçalho).");
        setColunas([]);
        setLinhas([]);
        return;
      }
      setColunas(Object.keys(rows[0]));
      setLinhas(rows);
    } catch {
      setErro("Não consegui ler o arquivo. Tente exportar como .xlsx ou .csv.");
    }
  }

  async function importar() {
    setImportando(true);
    setErro("");
    setOk("");
    try {
      const r = await fetch("/api/insights/importar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          loja_id: lojaId || null,
          periodo_inicio: periodoInicio || null,
          periodo_fim: periodoFim || null,
          arquivo,
          colunas,
          linhas,
        }),
      });
      const d = await r.json();
      if (!d.sucesso) {
        setErro(d.erro || "Falha ao importar.");
      } else {
        setOk(`Importado! ${d.total_linhas} linha(s) guardada(s).`);
        setColunas([]);
        setLinhas([]);
        setArquivo("");
        router.refresh();
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao importar.");
    } finally {
      setImportando(false);
    }
  }

  const previa = linhas.slice(0, 15);

  return (
    <div className="rounded-2xl border border-cyan-800 bg-slate-900 p-6">
      <h2 className="text-2xl font-bold">Importar planilha do Business Insights</h2>
      <p className="mt-2 text-sm text-slate-400">
        Exporte o relatório no Seller Center (Excel/CSV) e suba aqui. O sistema
        detecta as colunas automaticamente — é assim que vamos ver o que os dados
        realmente trazem antes de montar a análise.
      </p>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <select
          value={lojaId}
          onChange={(e) => setLojaId(e.target.value)}
          className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-sm text-white"
        >
          <option value="">Loja (opcional)</option>
          {lojas.map((l) => (
            <option key={l.id} value={l.id}>
              {l.apelido}
            </option>
          ))}
        </select>

        <label className="flex items-center gap-2 text-xs text-slate-400">
          Período de
          <input
            type="date"
            value={periodoInicio}
            onChange={(e) => setPeriodoInicio(e.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white"
          />
          até
          <input
            type="date"
            value={periodoFim}
            onChange={(e) => setPeriodoFim(e.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white"
          />
        </label>

        <input
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={aoEscolherArquivo}
          className="text-sm text-slate-300 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-700 file:px-4 file:py-2 file:text-white"
        />

        <button
          onClick={importar}
          disabled={importando || linhas.length === 0}
          className="rounded-xl bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-500 disabled:opacity-50"
        >
          {importando ? "Importando..." : "Importar"}
        </button>
      </div>

      {erro && (
        <div className="mt-4 rounded-lg bg-red-900/60 px-3 py-2 text-sm text-red-200">
          {erro}
        </div>
      )}
      {ok && (
        <div className="mt-4 rounded-lg bg-green-900/60 px-3 py-2 text-sm text-green-200">
          {ok}
        </div>
      )}

      {colunas.length > 0 && (
        <div className="mt-6">
          <p className="text-sm text-slate-300">
            <strong>{colunas.length} coluna(s)</strong> detectada(s) •{" "}
            {linhas.length} linha(s):
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {colunas.map((c) => (
              <span
                key={c}
                className="rounded-full bg-slate-700 px-3 py-1 text-xs text-slate-200"
              >
                {c}
              </span>
            ))}
          </div>

          <div className="mt-4 overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-800 text-slate-300">
                <tr>
                  {colunas.map((c) => (
                    <th key={c} className="whitespace-nowrap p-2">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previa.map((linha, i) => (
                  <tr key={i} className="border-t border-slate-800">
                    {colunas.map((c) => (
                      <td key={c} className="whitespace-nowrap p-2 text-slate-300">
                        {String(linha[c] ?? "")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Prévia das primeiras {previa.length} linhas. Se o cabeçalho parecer
            errado, o export pode ter linhas de título no topo — me avise que eu
            ajusto a leitura.
          </p>
        </div>
      )}
    </div>
  );
}
