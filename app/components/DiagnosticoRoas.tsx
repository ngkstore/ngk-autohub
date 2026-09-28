import Link from "next/link";
import { brl, x1, type DiagnosticoRoas as Diag, type ItemExplicado } from "@/lib/shopee/adsDiagnostico";

// Card "por que o ROAS mudou": semana atual vs anterior, decomposto por item
// (quem derrubou, quem puxou pra cima, quem parou de gastar), com causa e ação.
const dd = (iso: string) => { const [, m, d] = String(iso).split("-"); return `${d}/${m}`; };
const sinal = (v: number) => `${v >= 0 ? "+" : "−"}${x1(Math.abs(v))}`;

function Linha({ i, cor }: { i: ItemExplicado; cor: string }) {
  return (
    <li className="rounded-xl border border-slate-800 bg-slate-950/40 px-3 py-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <Link href={`/ads-controle/item?loja=${i.loja_id}&item=${i.item_id}`} className="font-semibold text-white underline decoration-slate-600 underline-offset-2 hover:decoration-emerald-400">
          {(i.produto || `item ${i.item_id}`).slice(0, 60)}
        </Link>
        <span className={`tabular-nums text-sm font-bold ${cor}`}>{sinal(i.contrib)} no ROAS</span>
      </div>
      <p className="mt-1 text-xs text-slate-400">
        gasto {brl(i.gasto_anterior)} → {brl(i.gasto_atual)} · ROAS {i.roas_anterior != null ? x1(i.roas_anterior) : "—"} → {i.roas_atual != null ? x1(i.roas_atual) : "—"}
        {i.tipo === "mix" && <span className="text-slate-500"> · efeito de mix (peso no gasto)</span>}
        {i.tipo === "novo" && <span className="text-blue-300"> · novo</span>}
      </p>
      <p className="mt-1 text-xs text-slate-300"><b>Por quê:</b> {i.motivo}</p>
      <p className="mt-0.5 text-xs text-emerald-300"><b>Fazer:</b> {i.recomendacao}</p>
    </li>
  );
}

export default function DiagnosticoRoas({ dg }: { dg: Diag }) {
  const delta = Number(dg.delta_roas || 0);
  const corDelta = delta < -0.5 ? "text-red-300" : delta > 0.5 ? "text-emerald-300" : "text-slate-300";
  return (
    <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-900 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-lg font-bold">🔍 Por que o ROAS mudou</h2>
        <p className="text-xs text-slate-500">
          {dd(dg.periodo.atual_ini)}–{dd(dg.periodo.atual_fim)} vs {dd(dg.periodo.ant_ini)}–{dd(dg.periodo.ant_fim)} · ROAS direto Shopee (GMV ÷ gasto)
        </p>
      </div>
      <p className="mt-2 text-sm">
        <span className={`font-bold ${corDelta}`}>{x1(dg.anterior.roas)} → {x1(dg.atual.roas)} ({sinal(delta)})</span>
        <span className="text-slate-400"> · gasto {brl(dg.anterior.gasto)} → {brl(dg.atual.gasto)} · GMV {brl(dg.anterior.gmv)} → {brl(dg.atual.gmv)}</span>
      </p>
      <p className="mt-1 text-sm text-slate-300">{dg.resumo}</p>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div>
          <h3 className="text-sm font-semibold text-red-300">▼ Derrubaram o ROAS</h3>
          {dg.derrubaram.length === 0 ? <p className="mt-1 text-xs text-slate-500">nenhum item com peso relevante</p> : (
            <ul className="mt-2 space-y-2">{dg.derrubaram.slice(0, 6).map((i) => <Linha key={`${i.loja_id}-${i.item_id}`} i={i} cor="text-red-300" />)}</ul>
          )}
        </div>
        <div>
          <h3 className="text-sm font-semibold text-emerald-300">▲ Puxaram pra cima</h3>
          {dg.puxaram.length === 0 ? <p className="mt-1 text-xs text-slate-500">nenhum item com peso relevante</p> : (
            <ul className="mt-2 space-y-2">{dg.puxaram.slice(0, 6).map((i) => <Linha key={`${i.loja_id}-${i.item_id}`} i={i} cor="text-emerald-300" />)}</ul>
          )}
        </div>
      </div>

      {dg.sumiram.length > 0 && (
        <p className="mt-4 text-xs text-slate-400">
          ⏸ Pararam de gastar: {dg.sumiram.slice(0, 5).map((i) => `${(i.produto || `item ${i.item_id}`).slice(0, 40)} (${brl(i.gasto_anterior)}, ROAS ${x1(i.roas_anterior)})`).join(" · ")}
          {dg.sumiram.length > 5 ? ` · +${dg.sumiram.length - 5}` : ""}
        </p>
      )}
      <p className="mt-3 text-[11px] text-slate-500">
        A soma das contribuições é exatamente a variação do ROAS. <b>Eficiência</b> = o ROAS do próprio item mudou (conversão, CTR, CPC, promoção, meta).
        <b> Mix</b> = o gasto migrou pra itens acima/abaixo da média. A recomendação usa a ação do motor quando o item já está classificado.
      </p>
    </div>
  );
}
