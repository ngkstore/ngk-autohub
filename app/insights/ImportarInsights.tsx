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
  const [cabecalhoLinha, setCabecalhoLinha] = useState(0);
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
      // codepage 65001 = UTF-8 (evita acento quebrado nos CSV da Shopee).
      const wb = XLSX.read(buf, { type: "array", codepage: 65001 });
      const ws = wb.Sheets[wb.SheetNames[0]];

      // Os exports da Shopee têm várias linhas de título antes da tabela.
      // Acha o cabeçalho real: a linha com mais células preenchidas.
      const cruas = XLSX.utils.sheet_to_json<unknown[]>(ws, {
        header: 1,
        defval: "",
      });
      let idxCabecalho = 0;
      let maisCelulas = 0;
      for (let i = 0; i < Math.min(20, cruas.length); i++) {
        const qtd = (cruas[i] || []).filter(
          (c) => String(c ?? "").trim() !== ""
        ).length;
        if (qtd > maisCelulas) {
          maisCelulas = qtd;
          idxCabecalho = i;
        }
      }

      const rows = XLSX.utils.sheet_to_json<Linha>(ws, {
        range: idxCabecalho,
        defval: "",
      });
      if (rows.length === 0) {
        setErro("Não encontrei linhas de dados na planilha.");
        setColunas([]);
        setLinhas([]);
        return;
      }
      setCabecalhoLinha(idxCabecalho + 1);
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
    <div className="rounded-2xl border border-primaria bg-superficie p-6">
      <h2 className="text-2xl font-bold">Importar planilha do Business Insights</h2>
      <p className="mt-2 text-sm text-texto-2">
        Exporte o relatório no Seller Center (Excel/CSV) e suba aqui. O sistema
        detecta as colunas automaticamente — é assim que vamos ver o que os dados
        realmente trazem antes de montar a análise.
      </p>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <select
          value={lojaId}
          onChange={(e) => setLojaId(e.target.value)}
          className="rounded-lg border border-borda bg-superficie-2 px-4 py-2 text-sm text-texto"
        >
          <option value="">Loja (opcional)</option>
          {lojas.map((l) => (
            <option key={l.id} value={l.id}>
              {l.apelido}
            </option>
          ))}
        </select>

        <label className="flex items-center gap-2 text-xs text-texto-2">
          Período de
          <input
            type="date"
            value={periodoInicio}
            onChange={(e) => setPeriodoInicio(e.target.value)}
            className="rounded-lg border border-borda bg-superficie-2 px-3 py-2 text-texto"
          />
          até
          <input
            type="date"
            value={periodoFim}
            onChange={(e) => setPeriodoFim(e.target.value)}
            className="rounded-lg border border-borda bg-superficie-2 px-3 py-2 text-texto"
          />
        </label>

        <input
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={aoEscolherArquivo}
          className="text-sm text-texto file:mr-3 file:rounded-lg file:border-0 file:bg-chip-cinza-fundo file:px-4 file:py-2 file:text-texto"
        />

        <button
          onClick={importar}
          disabled={importando || linhas.length === 0}
          className="rounded-xl bg-primaria px-4 py-2 text-sm font-semibold text-texto hover:bg-primaria-hover disabled:opacity-50"
        >
          {importando ? "Importando..." : "Importar"}
        </button>
      </div>

      {erro && (
        <div className="mt-4 rounded-lg bg-chip-vermelho-fundo/60 px-3 py-2 text-sm text-perigo">
          {erro}
        </div>
      )}
      {ok && (
        <div className="mt-4 rounded-lg bg-chip-verde-fundo/60 px-3 py-2 text-sm text-sucesso">
          {ok}
        </div>
      )}

      {colunas.length > 0 && (
        <div className="mt-6">
          <p className="text-sm text-texto">
            <strong>{colunas.length} coluna(s)</strong> detectada(s) •{" "}
            {linhas.length} linha(s) • cabeçalho achado na linha{" "}
            <strong>{cabecalhoLinha}</strong> do arquivo:
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {colunas.map((c) => (
              <span
                key={c}
                className="rounded-full bg-chip-cinza-fundo px-3 py-1 text-xs text-texto"
              >
                {c}
              </span>
            ))}
          </div>

          <div className="mt-4 overflow-x-auto rounded-xl border border-borda">
            <table className="w-full text-left text-xs">
              <thead className="bg-superficie-2 text-texto">
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
                  <tr key={i} className="border-t border-borda">
                    {colunas.map((c) => (
                      <td key={c} className="whitespace-nowrap p-2 text-texto">
                        {String(linha[c] ?? "")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-texto-2">
            Prévia das primeiras {previa.length} linhas. Se o cabeçalho parecer
            errado, o export pode ter linhas de título no topo — me avise que eu
            ajusto a leitura.
          </p>
        </div>
      )}
    </div>
  );
}
