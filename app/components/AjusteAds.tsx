"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Ajuste assistido (Fase 4): edita orçamento diário e/ou meta ROAS de UMA
// campanha na Shopee, com confirmação manual. Chama /api/shopee/ads/ajustar.
export default function AjusteAds({
  lojaId,
  campaignId,
  itemId,
  orcamentoAtual,
  metaAtual,
  orcamentoSugerido,
  metaSugerida,
  metaAnterior = null,
  reforcoBase = null,
  janela,
  diasRestantes,
}: {
  lojaId: string;
  campaignId: number;
  itemId: number;
  orcamentoAtual: number | null;
  metaAtual: number | null;
  orcamentoSugerido: number | null;
  metaSugerida: number | null;
  metaAnterior?: number | null; // "retomar meta": volta pra meta de antes do degrau
  reforcoBase?: number | null;  // reforço automático ativo hoje (orçamento base)
  janela: string | null;
  diasRestantes: number | null;
}) {
  const router = useRouter();
  const fmt = (v: number | null) => (v == null ? "" : String(v).replace(".", ","));
  const [orc, setOrc] = useState(fmt(orcamentoAtual));
  const [meta, setMeta] = useState(fmt(metaAtual));
  const [estado, setEstado] = useState<"idle" | "enviando" | "ok" | "erro">("idle");
  const [msg, setMsg] = useState("");
  const toNum = (s: string) => Number(s.replace(",", "."));

  const mudouOrc = orc !== "" && toNum(orc) !== Number(orcamentoAtual);
  const mudouMeta = meta !== "" && toNum(meta) !== Number(metaAtual);
  const emJanela = janela && janela !== "livre";

  async function aplicar() {
    const mudancas: string[] = [];
    if (mudouOrc) mudancas.push(`Orçamento/dia: R$ ${fmt(orcamentoAtual) || "—"} → R$ ${orc}`);
    if (mudouMeta) mudancas.push(`Meta ROAS: ${fmt(metaAtual) || "—"}× → ${meta}×`);
    if (!mudancas.length) { setMsg("Nada mudou."); setEstado("idle"); return; }
    const aviso = mudouMeta
      ? `\n\n⚠️ Alterar a meta (re)inicia a janela de estabilização de 12 dias${emJanela ? ` — este item já está em ${janela} (faltam ${diasRestantes ?? 0} dia(s))` : ""}.`
      : "";
    if (!window.confirm(`Aplicar na Shopee agora?\n\n${mudancas.join("\n")}${aviso}`)) return;
    setEstado("enviando"); setMsg("");
    try {
      const r = await fetch("/api/shopee/ads/ajustar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lojaId, campaignId, itemId,
          orcamento: mudouOrc ? orc : null,
          metaRoas: mudouMeta ? meta : null,
        }),
      });
      const d = await r.json();
      if (d.sucesso) {
        setEstado("ok"); setMsg("Aplicado na Shopee ✓");
        router.refresh();
      } else {
        const erros = (d.resultados || []).map((x: { campo: string; erro?: string }) => x.erro && `${x.campo}: ${x.erro}`).filter(Boolean).join(" · ");
        setEstado("erro"); setMsg(d.erro || erros || "Erro ao aplicar.");
      }
    } catch {
      setEstado("erro"); setMsg("Falha de rede.");
    }
  }

  const cls = "w-32 rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-right text-white focus:border-emerald-500 focus:outline-none";
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
      <h3 className="text-lg font-bold">⚙️ Ajustar na Shopee</h3>
      <p className="mt-1 text-xs text-slate-500">
        Execução assistida: você confirma cada alteração. O sistema registra a mudança e inicia o relógio de estabilização.
      </p>
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="text-xs text-slate-400">Orçamento diário (R$)</label>
          <div className="mt-1 flex items-center gap-2">
            <input value={orc} onChange={(e) => setOrc(e.target.value)} inputMode="decimal" className={cls} placeholder="—" />
            {orcamentoSugerido != null && (
              <button type="button" onClick={() => setOrc(fmt(Math.round(orcamentoSugerido)))} className="rounded-lg border border-amber-700/60 px-2 py-1 text-xs text-amber-300 hover:bg-amber-900/30">
                usar ideal R$ {Math.round(orcamentoSugerido)}
              </button>
            )}
          </div>
          <p className="mt-1 text-[11px] text-slate-500">atual: {orcamentoAtual != null ? `R$ ${fmt(orcamentoAtual)}` : "—"} (0 = sem limite na Shopee)</p>
          {reforcoBase != null && (
            <p className="mt-1 text-[11px] text-amber-300">⚡ reforço automático ativo hoje: base R$ {fmt(reforcoBase)}. O valor atual inclui o reforço; à meia-noite volta pra base. Se você salvar outro valor, ele vira a nova base.</p>
          )}
        </div>
        <div>
          <label className="text-xs text-slate-400">Meta ROAS (×)</label>
          <div className="mt-1 flex items-center gap-2">
            <input value={meta} onChange={(e) => setMeta(e.target.value)} inputMode="decimal" className={cls} placeholder="—" />
            {metaSugerida != null && (
              <button type="button" onClick={() => setMeta(fmt(metaSugerida))} className="rounded-lg border border-emerald-700/60 px-2 py-1 text-xs text-emerald-300 hover:bg-emerald-900/30">
                usar degrau {fmt(metaSugerida)}×
              </button>
            )}
            {metaAnterior != null && (
              <button type="button" onClick={() => setMeta(fmt(metaAnterior))} className="rounded-lg border border-red-700/60 px-2 py-1 text-xs text-red-300 hover:bg-red-900/30">
                voltar p/ {fmt(metaAnterior)}×
              </button>
            )}
          </div>
          <p className="mt-1 text-[11px] text-slate-500">
            atual: {metaAtual != null ? `${fmt(metaAtual)}×` : "—"}
            {emJanela && <span className="text-blue-300"> · em {janela} (faltam {diasRestantes ?? 0}d) — evite mexer na meta agora</span>}
          </p>
        </div>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={aplicar}
          disabled={estado === "enviando" || (!mudouOrc && !mudouMeta)}
          className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {estado === "enviando" ? "Aplicando…" : "Aplicar na Shopee"}
        </button>
        {msg && <span className={`text-sm ${estado === "ok" ? "text-emerald-300" : estado === "erro" ? "text-red-300" : "text-slate-400"}`}>{msg}</span>}
      </div>
    </div>
  );
}
