"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Edição inline (duas células da tabela do /ads-controle): meta ROAS e orçamento
// diário, com botões rápidos (degrau / voltar / ideal) e confirmação. Usa a mesma
// rota assistida do painel do produto (/api/shopee/ads/ajustar).
type Props = {
  lojaId: string;
  campaignId: number | null;
  itemId: number;
  metaAtual: number | null;
  orcamentoAtual: number | null;
  orcamentoIdeal: number | null;
  metaSugerida: number | null;   // próximo degrau (só quando o motor recomenda mexer na meta)
  metaAnterior: number | null;   // "retomar meta": meta de antes do degrau
  janela: string | null;
  diasRestantes: number | null;
  censurado: boolean;
  reforcoBase: number | null;    // reforço automático ativo hoje (orçamento base)
};

const fmt = (v: number | null | undefined) => (v == null ? "" : String(v).replace(".", ","));
const brl = (v: number) => `R$${Math.round(v).toLocaleString("pt-BR")}`;
const toNum = (s: string) => Number(s.replace(",", "."));

export default function AjusteInline(p: Props) {
  const router = useRouter();
  const [edit, setEdit] = useState(false);
  const [orc, setOrc] = useState(fmt(p.orcamentoAtual));
  const [meta, setMeta] = useState(fmt(p.metaAtual));
  const [estado, setEstado] = useState<"idle" | "enviando" | "ok" | "erro">("idle");
  const [msg, setMsg] = useState("");
  const mudouOrc = orc !== "" && toNum(orc) !== Number(p.orcamentoAtual);
  const mudouMeta = meta !== "" && toNum(meta) !== Number(p.metaAtual);
  const emJanela = p.janela && p.janela !== "livre";

  async function aplicar() {
    const mudancas: string[] = [];
    if (mudouOrc) mudancas.push(`Orçamento/dia: R$ ${fmt(p.orcamentoAtual) || "—"} → R$ ${orc}`);
    if (mudouMeta) mudancas.push(`Meta ROAS: ${fmt(p.metaAtual) || "—"}× → ${meta}×`);
    if (!mudancas.length) { setEdit(false); return; }
    const aviso = mudouMeta
      ? `\n\n⚠️ Alterar a meta (re)inicia a janela de estabilização de 12 dias${emJanela ? ` — este item já está em ${p.janela} (faltam ${p.diasRestantes ?? 0} dia(s))` : ""}.`
      : "";
    if (!window.confirm(`Aplicar na Shopee agora?\n\n${mudancas.join("\n")}${aviso}`)) return;
    setEstado("enviando"); setMsg("");
    try {
      const r = await fetch("/api/shopee/ads/ajustar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lojaId: p.lojaId, campaignId: p.campaignId, itemId: p.itemId,
          orcamento: mudouOrc ? orc : null,
          metaRoas: mudouMeta ? meta : null,
        }),
      });
      const d = await r.json();
      if (d.sucesso) {
        setEstado("ok"); setMsg("✓ aplicado"); setEdit(false);
        router.refresh();
      } else {
        const erros = (d.resultados || []).map((x: { campo: string; erro?: string }) => x.erro && `${x.campo}: ${x.erro}`).filter(Boolean).join(" · ");
        setEstado("erro"); setMsg(d.erro || erros || "erro ao aplicar");
      }
    } catch {
      setEstado("erro"); setMsg("falha de rede");
    }
  }

  const sobe = p.metaSugerida != null && p.metaAtual != null && p.metaSugerida > p.metaAtual;
  const corIdeal =
    p.orcamentoIdeal == null || p.orcamentoAtual == null ? "text-slate-300"
      : p.orcamentoIdeal > p.orcamentoAtual ? "text-emerald-300"
        : p.orcamentoIdeal < p.orcamentoAtual ? "text-orange-300" : "text-slate-300";
  const status = msg && (
    <span className={`ml-2 text-xs ${estado === "ok" ? "text-emerald-300" : estado === "erro" ? "text-red-300" : "text-slate-400"}`}>{msg}</span>
  );

  if (!edit) {
    return (
      <>
        <td className="p-3 text-right tabular-nums text-slate-400 whitespace-nowrap">
          {p.metaAtual != null ? `${p.metaAtual.toFixed(1).replace(".", ",")}×` : "—"}
          {p.metaSugerida != null && (
            sobe
              ? <span className="ml-1 text-xs text-emerald-300" title="subir a meta em degrau">↑ {fmt(p.metaSugerida)}×</span>
              : <span className="ml-1 text-xs text-orange-300" title="baixar a meta em degrau (meta não entregue)">↓ {fmt(p.metaSugerida)}×</span>
          )}
          {p.metaAnterior != null && <span className="ml-1 text-xs text-red-300" title="voltar à meta anterior">← {fmt(p.metaAnterior)}×</span>}
        </td>
        <td className="p-3 text-right tabular-nums whitespace-nowrap" title={p.censurado ? "consumo no teto do orçamento (média censurada): degrau de +25%" : undefined}>
          <span className="text-slate-400">{p.orcamentoAtual != null ? (p.orcamentoAtual === 0 ? "sem limite" : brl(p.orcamentoAtual)) : "—"}</span>
          {p.orcamentoIdeal != null && (
            <>
              <span className="text-slate-500"> → </span>
              <span className={corIdeal}>{brl(p.orcamentoIdeal)}</span>
            </>
          )}
          {p.censurado && <span className="ml-1 text-xs text-amber-300">teto</span>}
          {p.reforcoBase != null && <span className="ml-1 text-xs text-amber-300" title={`reforço automático ativo hoje (base ${brl(p.reforcoBase)}); volta ao base à meia-noite`}>⚡</span>}
          {p.campaignId ? (
            <button type="button" onClick={() => { setEdit(true); setMsg(""); setEstado("idle"); }} className="ml-2 rounded px-1 text-xs text-slate-500 hover:bg-slate-700 hover:text-white" title="Editar meta e orçamento aqui">✎</button>
          ) : null}
          {status}
        </td>
      </>
    );
  }

  const cls = "w-20 rounded border border-slate-600 bg-slate-800 px-1.5 py-1 text-right text-sm text-white focus:border-emerald-500 focus:outline-none";
  const mini = "rounded border px-1.5 py-0.5 text-[11px]";
  return (
    <>
      <td className="p-2 text-right whitespace-nowrap">
        <div className="flex items-center justify-end gap-1">
          <input value={meta} onChange={(e) => setMeta(e.target.value)} inputMode="decimal" className={cls} placeholder="meta" autoFocus />
          <span className="text-xs text-slate-500">×</span>
          {p.metaSugerida != null && (
            <button type="button" onClick={() => setMeta(fmt(p.metaSugerida))} className={`${mini} ${sobe ? "border-emerald-700/60 text-emerald-300 hover:bg-emerald-900/30" : "border-orange-700/60 text-orange-300 hover:bg-orange-900/30"}`} title={sobe ? "subir a meta em degrau" : "baixar a meta em degrau (meta não entregue)"}>{sobe ? "↑" : "↓"} {fmt(p.metaSugerida)}</button>
          )}
          {p.metaAnterior != null && (
            <button type="button" onClick={() => setMeta(fmt(p.metaAnterior))} className={`${mini} border-red-700/60 text-red-300 hover:bg-red-900/30`} title="voltar à meta anterior">voltar {fmt(p.metaAnterior)}</button>
          )}
        </div>
        {emJanela && mudouMeta && <p className="mt-1 text-[10px] text-blue-300">em {p.janela} (faltam {p.diasRestantes ?? 0}d)</p>}
      </td>
      <td className="p-2 text-right whitespace-nowrap">
        <div className="flex items-center justify-end gap-1">
          <span className="text-xs text-slate-500">R$</span>
          <input value={orc} onChange={(e) => setOrc(e.target.value)} inputMode="decimal" className={cls} placeholder="orç." />
          {p.orcamentoIdeal != null && p.orcamentoIdeal > 0 && (
            <button type="button" onClick={() => setOrc(fmt(Math.round(p.orcamentoIdeal!)))} className={`${mini} border-amber-700/60 text-amber-300 hover:bg-amber-900/30`} title="usar orçamento ideal">ideal {Math.round(p.orcamentoIdeal)}</button>
          )}
          <button
            type="button"
            onClick={aplicar}
            disabled={estado === "enviando" || (!mudouOrc && !mudouMeta)}
            className="rounded bg-emerald-600 px-2 py-1 text-xs font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {estado === "enviando" ? "…" : "Aplicar"}
          </button>
          <button type="button" onClick={() => { setEdit(false); setOrc(fmt(p.orcamentoAtual)); setMeta(fmt(p.metaAtual)); setMsg(""); }} className="rounded px-1.5 py-1 text-xs text-slate-400 hover:bg-slate-700 hover:text-white" title="cancelar">✕</button>
        </div>
        {p.reforcoBase != null && <p className="mt-1 text-[10px] text-amber-300">⚡ reforço ativo (base R$ {fmt(p.reforcoBase)}); o valor salvo vira a nova base</p>}
        {status}
      </td>
    </>
  );
}
