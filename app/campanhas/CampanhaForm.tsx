"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader, Botao } from "../components/ui";

type Loja = { id: string; apelido: string };
type Campanha = { id?: string; canal: string; loja_id: string | null; nome: string; tipo: string; inicio: string | null; fim: string | null; prazo_inscricao: string | null; desconto_min: number | null; estoque_min: number | null; exigencias: string | null; link: string | null; observacao: string | null };

const local = (iso: string | null | undefined) => (iso ? new Date(iso).toISOString().slice(0, 16) : "");

// F1 — cadastro manual de campanha das plataformas (não há API) + itens; F3 — Simular margem.
export default function CampanhaForm({ lojas, campanha, admin, onFechar }: { lojas: Loja[]; campanha?: Campanha | null; admin: boolean; onFechar?: () => void }) {
  const router = useRouter();
  const [f, setF] = useState<Campanha>(campanha ?? { canal: "shopee", loja_id: lojas[0]?.id ?? null, nome: "", tipo: "plataforma", inicio: null, fim: null, prazo_inscricao: null, desconto_min: null, estoque_min: null, exigencias: null, link: null, observacao: null });
  const [item, setItem] = useState({ sku: "", nome: "", preco_normal: "", preco_campanha: "", estoque_promocao: "" });
  const [msg, setMsg] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const inp = "h-8 w-full rounded-lg border border-borda bg-superficie px-2 text-[13px] text-texto";

  async function post(body: Record<string, unknown>) {
    setOcupado(true);
    setMsg(null);
    const r = await fetch("/api/campanhas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await r.json();
    setMsg(d.sucesso ? (d.negativos !== undefined ? `Margem calculada: ${d.itens} item(ns), ${d.negativos} negativo(s).` : "Salvo.") : d.erro || "Erro.");
    setOcupado(false);
    router.refresh();
    return d;
  }

  if (!admin) return null;
  return (
    <Card>
      <CardHeader titulo={f.id ? `Editar · ${f.nome}` : "Nova campanha"} descricao="campanhas das plataformas são cadastradas à mão (não há API); promoções próprias vêm pela API" acoes={onFechar ? <Botao pequeno onClick={onFechar}>Fechar</Botao> : undefined} />
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <input value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} placeholder="Nome (Black Friday Shopee)" className={`${inp} col-span-2`} />
        <select value={f.canal} onChange={(e) => setF({ ...f, canal: e.target.value })} className={inp}>
          <option value="shopee">Shopee</option>
          <option value="tiktok">TikTok</option>
          <option value="ambos">Ambos</option>
        </select>
        <select value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })} className={inp}>
          <option value="plataforma">Campanha da plataforma</option>
          <option value="propria">Promoção própria</option>
          <option value="afiliado">Campanha de afiliados</option>
          <option value="live">Live</option>
        </select>
        <select value={f.loja_id ?? ""} onChange={(e) => setF({ ...f, loja_id: e.target.value || null })} className={`${inp} col-span-2`}>
          <option value="">Todas as lojas</option>
          {lojas.map((l) => (
            <option key={l.id} value={l.id}>
              {l.apelido}
            </option>
          ))}
        </select>
        <label className="text-xs text-texto-2">
          Início
          <input type="datetime-local" value={local(f.inicio)} onChange={(e) => setF({ ...f, inicio: e.target.value || null })} className={inp} />
        </label>
        <label className="text-xs text-texto-2">
          Fim
          <input type="datetime-local" value={local(f.fim)} onChange={(e) => setF({ ...f, fim: e.target.value || null })} className={inp} />
        </label>
        <label className="text-xs text-texto-2">
          Prazo de inscrição
          <input type="datetime-local" value={local(f.prazo_inscricao)} onChange={(e) => setF({ ...f, prazo_inscricao: e.target.value || null })} className={inp} />
        </label>
        <input value={f.desconto_min ?? ""} onChange={(e) => setF({ ...f, desconto_min: e.target.value ? Number(e.target.value) : null })} placeholder="Desconto mínimo %" inputMode="decimal" className={inp} />
        <input value={f.estoque_min ?? ""} onChange={(e) => setF({ ...f, estoque_min: e.target.value ? Number(e.target.value) : null })} placeholder="Estoque mínimo" inputMode="numeric" className={inp} />
        <input value={f.link ?? ""} onChange={(e) => setF({ ...f, link: e.target.value || null })} placeholder="Link no Seller Center" className={inp} />
        <input value={f.exigencias ?? ""} onChange={(e) => setF({ ...f, exigencias: e.target.value || null })} placeholder="Outras exigências" className={`${inp} col-span-2 md:col-span-4`} />
        <input value={f.observacao ?? ""} onChange={(e) => setF({ ...f, observacao: e.target.value || null })} placeholder="Observação" className={`${inp} col-span-2 md:col-span-4`} />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Botao variante="principal" disabled={ocupado || !f.nome} onClick={() => post({ campanha: f }).then((d) => d.sucesso && !f.id && setF({ ...f, id: d.id }))}>
          {f.id ? "Salvar" : "Criar campanha"}
        </Botao>
        {f.id && (
          <Botao disabled={ocupado} onClick={() => post({ simular: f.id })}>
            Simular margem
          </Botao>
        )}
        {f.id && (
          <Botao variante="destrutivo" disabled={ocupado} onClick={() => post({ apagar: f.id }).then(() => onFechar?.())}>
            Apagar
          </Botao>
        )}
        {msg && <span className="text-xs text-texto-2">{msg}</span>}
      </div>
      {f.id && (
        <div className="mt-4 border-t border-borda pt-3">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-texto-2">Inscrever item (manual)</p>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-6">
            <input value={item.sku} onChange={(e) => setItem({ ...item, sku: e.target.value })} placeholder="SKU" className={inp} />
            <input value={item.nome} onChange={(e) => setItem({ ...item, nome: e.target.value })} placeholder="Produto" className={`${inp} col-span-2`} />
            <input value={item.preco_normal} onChange={(e) => setItem({ ...item, preco_normal: e.target.value })} placeholder="Preço normal" inputMode="decimal" className={inp} />
            <input value={item.preco_campanha} onChange={(e) => setItem({ ...item, preco_campanha: e.target.value })} placeholder="Preço da campanha" inputMode="decimal" className={inp} />
            <Botao pequeno disabled={ocupado || !item.preco_campanha} onClick={() => post({ item: { campanha_id: f.id, sku: item.sku, nome: item.nome, item_id: item.sku || null, preco_normal: item.preco_normal.replace(",", "."), preco_campanha: item.preco_campanha.replace(",", "."), estoque_promocao: item.estoque_promocao } }).then(() => setItem({ sku: "", nome: "", preco_normal: "", preco_campanha: "", estoque_promocao: "" }))}>
              Adicionar
            </Botao>
          </div>
        </div>
      )}
    </Card>
  );
}
