"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader, Botao, Dica } from "../components/ui";

type Loja = { id: string; apelido: string; canal: "shopee" | "tiktok" };

// E3/E4 — "Lançar live" (Shopee, sem API no Brasil) e "Lançar SPS" (TikTok, sem API no Brasil),
// mais o botão de sincronizar depois da live (TikTok).
export default function Lancamentos({ lojas }: { lojas: Loja[] }) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const shopee = lojas.filter((l) => l.canal === "shopee");
  const tiktok = lojas.filter((l) => l.canal === "tiktok");
  const [live, setLive] = useState({ loja_id: shopee[0]?.id || "", inicio: "", duracao_min: "", receita: "", pedidos: "", espectadores: "", pico: "", apresentador: "", observacao: "" });
  const [sps, setSps] = useState({ loja_id: tiktok[0]?.id || "", dia: new Date().toISOString().slice(0, 10), sps: "", observacao: "" });

  async function post(body: Record<string, unknown>) {
    setOcupado(true);
    setMsg(null);
    const r = await fetch("/api/lives/lancar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await r.json();
    setMsg(d.sucesso ? "Lançado." : d.erro || "Erro.");
    setOcupado(false);
    router.refresh();
  }
  async function sincronizar() {
    setOcupado(true);
    setMsg("Sincronizando TikTok (últimos 2 dias)…");
    const r = await fetch("/api/lives/sincronizar?dias=2&canal=tiktok");
    const d = await r.json();
    setMsg(d.sucesso ? "TikTok sincronizado." : d.erro || "Erro.");
    setOcupado(false);
    router.refresh();
  }
  const inp = "h-8 rounded-lg border border-borda bg-superficie px-2 text-[13px] text-texto";

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
      <Card>
        <CardHeader titulo="Lançar live (Shopee)" descricao="a API de lives da Shopee não vale no Brasil: preencha ao fim da live" acoes={tiktok.length ? <Botao pequeno disabled={ocupado} onClick={sincronizar}>Sincronizar TikTok agora</Botao> : undefined} />
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <select value={live.loja_id} onChange={(e) => setLive({ ...live, loja_id: e.target.value })} className={`${inp} col-span-2`}>
            {shopee.map((l) => (
              <option key={l.id} value={l.id}>
                {l.apelido}
              </option>
            ))}
          </select>
          <input type="datetime-local" value={live.inicio} onChange={(e) => setLive({ ...live, inicio: e.target.value })} className={`${inp} col-span-2`} />
          <input value={live.duracao_min} onChange={(e) => setLive({ ...live, duracao_min: e.target.value })} placeholder="Duração (min)" inputMode="numeric" className={inp} />
          <input value={live.receita} onChange={(e) => setLive({ ...live, receita: e.target.value })} placeholder="Receita R$" inputMode="decimal" className={inp} />
          <input value={live.pedidos} onChange={(e) => setLive({ ...live, pedidos: e.target.value })} placeholder="Pedidos" inputMode="numeric" className={inp} />
          <input value={live.espectadores} onChange={(e) => setLive({ ...live, espectadores: e.target.value })} placeholder="Espectadores" inputMode="numeric" className={inp} />
          <input value={live.pico} onChange={(e) => setLive({ ...live, pico: e.target.value })} placeholder="Pico" inputMode="numeric" className={inp} />
          <input value={live.apresentador} onChange={(e) => setLive({ ...live, apresentador: e.target.value })} placeholder="Apresentador" className={`${inp} col-span-2`} />
          <input value={live.observacao} onChange={(e) => setLive({ ...live, observacao: e.target.value })} placeholder="Observação" className={`${inp} col-span-2 md:col-span-4`} />
        </div>
        <div className="mt-3 flex items-center gap-2">
          <Botao variante="principal" disabled={ocupado || !live.loja_id || !live.inicio} onClick={() => post({ live: { ...live, receita: Number(live.receita.replace(",", ".")) } })}>
            Lançar live
          </Botao>
        </div>
      </Card>
      <Card>
        <CardHeader titulo="Lançar SPS (TikTok)" descricao="o SPS não tem API no Brasil: lance a nota semanal do Seller Center (ou a extensão captura)" />
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <select value={sps.loja_id} onChange={(e) => setSps({ ...sps, loja_id: e.target.value })} className={`${inp} col-span-2`}>
            {tiktok.map((l) => (
              <option key={l.id} value={l.id}>
                {l.apelido}
              </option>
            ))}
          </select>
          <input type="date" value={sps.dia} onChange={(e) => setSps({ ...sps, dia: e.target.value })} className={inp} />
          <input value={sps.sps} onChange={(e) => setSps({ ...sps, sps: e.target.value })} placeholder="SPS (0 a 5)" inputMode="decimal" className={inp} />
          <input value={sps.observacao} onChange={(e) => setSps({ ...sps, observacao: e.target.value })} placeholder="Observação" className={`${inp} col-span-2 md:col-span-4`} />
        </div>
        <div className="mt-3 flex items-center gap-2">
          <Botao variante="principal" disabled={ocupado || !sps.loja_id || !sps.sps} onClick={() => post({ sps })}>
            Lançar SPS
          </Botao>
        </div>
        <Dica className="mt-3">Abaixo de 3,0 o TikTok bloqueia novas parcerias com afiliados; 3,5 é a meta.</Dica>
      </Card>
      {msg && <p className="text-xs text-texto-2 xl:col-span-2">{msg}</p>}
    </div>
  );
}
