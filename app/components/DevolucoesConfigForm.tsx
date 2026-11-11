"use client";

import { useEffect, useState } from "react";
import { Card, CardHeader, Switch, Botao, Aviso, Dica } from "./ui";

type Limites = { auto_caso_max: number; auto_dia_max: number; alerta_horas: number; suspeito_devolucoes_90d: number; credito_dias: number };
type Cfg = { acoes_api: boolean; email_disputa: string | null; limites: Limites };

// Configurações → Devoluções (B3/B4): flag das ações pela API (desligada por padrão),
// e-mail da disputa Shopee e os valores dos limites fixos.
export default function DevolucoesConfigForm() {
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/devolucoes/config")
      .then((r) => r.json())
      .then((d) => d.sucesso && setCfg({ acoes_api: !!d.acoes_api, email_disputa: d.email_disputa ?? "", limites: d.limites }))
      .catch(() => null);
  }, []);

  async function salvar(parcial: Partial<Cfg>) {
    if (!cfg) return;
    setSalvando(true);
    setMsg(null);
    const r = await fetch("/api/devolucoes/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(parcial) });
    const d = await r.json();
    if (d.sucesso) {
      setCfg({ acoes_api: !!d.acoes_api, email_disputa: d.email_disputa ?? "", limites: d.limites });
      setMsg("Salvo.");
    } else setMsg(d.erro || "Erro ao salvar.");
    setSalvando(false);
  }

  if (!cfg) return null;
  const lim = cfg.limites;
  const campo = (k: keyof Limites, rotulo: string, sufixo: string) => (
    <label className="flex items-center justify-between gap-3 text-[13px] text-texto">
      <span>{rotulo}</span>
      <span className="flex items-center gap-1.5">
        <input
          type="number"
          min={0}
          value={lim[k]}
          onChange={(e) => setCfg({ ...cfg, limites: { ...lim, [k]: Number(e.target.value) } })}
          className="h-8 w-24 rounded-lg border border-borda bg-superficie px-2 text-right text-[13px] text-texto"
        />
        <span className="text-xs text-texto-2">{sufixo}</span>
      </span>
    </label>
  );

  return (
    <Card className="mt-6">
      <CardHeader titulo="Devoluções" descricao="Ações pela API, e-mail da disputa Shopee e limites do assistente." />
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <div className="space-y-3">
          <Switch ligado={cfg.acoes_api} onChange={(v) => salvar({ acoes_api: v })} desabilitado={salvando} rotulo={<span className="font-medium">Ações pela API (aprovar, recusar, disputar, oferecer)</span>} />
          {cfg.acoes_api ? (
            <Aviso>Ligado: o assistente e a equipe podem enviar decisões à Shopee e ao TikTok. Recusa, disputa e oferta continuam exigindo aprovação.</Aviso>
          ) : (
            <Dica>Desligado: o AutoHub só sugere; as respostas continuam pelo Seller Center. Ligue quando quiser que as aprovações no Telegram sejam enviadas de verdade.</Dica>
          )}
          <label className="block text-[13px] text-texto">
            <span className="mb-1 block font-medium">E-mail exigido pela Shopee na disputa</span>
            <input
              type="email"
              value={cfg.email_disputa ?? ""}
              onChange={(e) => setCfg({ ...cfg, email_disputa: e.target.value })}
              placeholder="e-mail de login da loja"
              className="h-9 w-full rounded-lg border border-borda bg-superficie px-3 text-[13px] text-texto"
            />
          </label>
        </div>
        <div className="space-y-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-texto-2">Limites (as regras não passam deles)</p>
          {campo("auto_caso_max", "Aprovação automática até", "R$ por caso")}
          {campo("auto_dia_max", "Aprovação automática até", "R$ por dia")}
          {campo("alerta_horas", "Alerta de prazo com menos de", "horas")}
          {campo("suspeito_devolucoes_90d", "Comprador suspeito a partir de", "devoluções em 90 d")}
          {campo("credito_dias", "Cobrar crédito da disputa após", "dias")}
        </div>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <Botao variante="principal" disabled={salvando} onClick={() => salvar({ email_disputa: cfg.email_disputa, limites: cfg.limites })}>
          {salvando ? "Salvando…" : "Salvar"}
        </Botao>
        {msg && <span className="text-xs text-texto-2">{msg}</span>}
      </div>
    </Card>
  );
}
