"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader, Botao, Tabela, Th, Tr, Td, Dica, Aviso } from "../components/ui";

type Forn = { id: string; nome: string; prazo_dias: number; seguranca_dias: number; caixa_padrao: number | null; observacao: string | null; ativo: boolean };
type Fator = { id: string; nome: string; inicio: string; fim: string; fator: number };
type Compra = { id: string; sku: string; quantidade: number; previsao: string | null; fornecedor_id: string | null; observacao: string | null };

// D2/D4 — Fornecedores e prazos, fator sazonal, compras a caminho, kits e importação de planilhas.
export default function EstoqueCadastros({ aba, fornecedores, fatores, compras, admin, lojas }: { aba: string; fornecedores: Forn[]; fatores: Fator[]; compras: Compra[]; admin: boolean; lojas: { id: string }[] }) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [fForm, setFForm] = useState<Partial<Forn>>({ nome: "", prazo_dias: 15, seguranca_dias: 5 });
  const [fatorForm, setFatorForm] = useState({ nome: "", inicio: "", fim: "", fator: "1.5" });
  const [compraForm, setCompraForm] = useState({ sku: "", quantidade: "", previsao: "", fornecedor_id: "", observacao: "" });
  const [kitForm, setKitForm] = useState({ sku_kit: "", componentes: "" });
  const [excForm, setExcForm] = useState({ sku: "", fornecedor_id: "", prazo_dias: "", seguranca_dias: "", caixa: "" });
  const [resultado, setResultado] = useState<Record<string, unknown> | null>(null);

  async function post(body: Record<string, unknown>) {
    setOcupado(true);
    setMsg(null);
    const r = await fetch("/api/estoque/cadastros", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await r.json();
    setMsg(d.sucesso ? "Salvo." : d.erro || "Erro.");
    setOcupado(false);
    router.refresh();
    return d;
  }

  async function importar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setOcupado(true);
    setResultado(null);
    const fd = new FormData(e.currentTarget);
    const r = await fetch("/api/estoque/importar", { method: "POST", body: fd });
    const d = await r.json();
    setResultado(d);
    setOcupado(false);
    router.refresh();
  }

  if (!admin) return <Aviso>Só o administrador da conta altera cadastros de estoque.</Aviso>;

  if (aba === "importar") {
    return (
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader titulo="Produtos do armazém (com kits)" descricao="UpSeller → Importar & Exportar → Produtos do Armazém, salvo como CSV" />
          <form onSubmit={importar} className="space-y-3 text-[13px]">
            <input type="hidden" name="tipo" value="produtos" />
            <input type="file" name="arquivo" accept=".csv,text/csv" required className="block w-full text-texto" />
            <Dica>Colunas reconhecidas pelo nome: SKU, Nome, Tipo/Kit, Componentes (ex.: “CADEIRA x4; MESA x1”), Peso, Custo, Fornecedor, Unidades por caixa. O que não bater fica de fora e aparece no resumo.</Dica>
            <Botao variante="principal" disabled={ocupado} type="submit">
              {ocupado ? "Importando…" : "Importar produtos"}
            </Botao>
          </form>
        </Card>
        <Card>
          <CardHeader titulo="Mapeamento de SKU do anúncio" descricao="UpSeller → Importar & Exportar → Mapeamento de SKU do anúncio, em CSV" />
          <form onSubmit={importar} className="space-y-3 text-[13px]">
            <input type="hidden" name="tipo" value="mapeamento" />
            <input type="file" name="arquivo" accept=".csv,text/csv" required className="block w-full text-texto" />
            <label className="block">
              <span className="mb-1 block text-xs text-texto-2">Loja padrão (quando a planilha não traz a loja)</span>
              <select name="loja" className="h-8 rounded-lg border border-borda bg-superficie px-2 text-texto">
                <option value="">—</option>
                {lojas.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.id.slice(0, 8)}
                  </option>
                ))}
              </select>
            </label>
            <Dica>Colunas: Loja/Canal, Item ID, Model ID, SKU do anúncio, SKU do armazém.</Dica>
            <Botao variante="principal" disabled={ocupado} type="submit">
              {ocupado ? "Importando…" : "Importar mapeamento"}
            </Botao>
          </form>
        </Card>
        {resultado && (
          <Card className="xl:col-span-2">
            <CardHeader titulo="Resultado" />
            <pre className="overflow-auto rounded-lg bg-superficie-2 p-3 text-xs text-texto">{JSON.stringify(resultado, null, 1)}</pre>
          </Card>
        )}
        <Card className="xl:col-span-2">
          <CardHeader titulo="Kit (manual)" descricao="sku do kit e componentes como “SKUA x4; SKUB x1”" />
          <div className="flex flex-wrap items-end gap-2 text-[13px]">
            <input value={kitForm.sku_kit} onChange={(e) => setKitForm({ ...kitForm, sku_kit: e.target.value })} placeholder="SKU do kit" className="h-8 rounded-lg border border-borda bg-superficie px-2 text-texto" />
            <input value={kitForm.componentes} onChange={(e) => setKitForm({ ...kitForm, componentes: e.target.value })} placeholder="SKUA x4; SKUB x1" className="h-8 w-72 rounded-lg border border-borda bg-superficie px-2 text-texto" />
            <Botao pequeno disabled={ocupado} onClick={() => post({ kit: { sku_kit: kitForm.sku_kit.trim(), componentes: kitForm.componentes.split(/[;,]/).map((p) => { const m = p.trim().match(/^(\S+)\s*(?:[x×*]\s*(\d+))?$/i); return m ? { sku: m[1], quantidade: Number(m[2] || 1) } : { sku: "", quantidade: 1 }; }) } })}>
              Salvar kit
            </Botao>
          </div>
          {msg && <p className="mt-2 text-xs text-texto-2">{msg}</p>}
        </Card>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
      <Card semPadding>
        <CardHeader className="px-[18px] pt-4" titulo="Fornecedores e prazos" descricao="prazo de reposição + dias de segurança definem o ponto de pedido" />
        <Tabela>
          <thead>
            <tr>
              <Th>Fornecedor</Th>
              <Th numerica>Prazo (d)</Th>
              <Th numerica>Segurança (d)</Th>
              <Th numerica>Caixa</Th>
              <Th></Th>
            </tr>
          </thead>
          <tbody>
            {fornecedores.map((f) => (
              <Tr key={f.id}>
                <Td>
                  {f.nome}
                  {!f.ativo && <span className="ml-2 text-xs text-texto-2">(inativo)</span>}
                </Td>
                <Td numerica>{f.prazo_dias}</Td>
                <Td numerica>{f.seguranca_dias}</Td>
                <Td numerica>{f.caixa_padrao ?? "—"}</Td>
                <Td>
                  <Botao pequeno onClick={() => setFForm(f)}>Editar</Botao>
                </Td>
              </Tr>
            ))}
          </tbody>
        </Tabela>
        <div className="grid grid-cols-2 gap-2 px-[18px] py-3 text-[13px] md:grid-cols-5">
          <input value={fForm.nome || ""} onChange={(e) => setFForm({ ...fForm, nome: e.target.value })} placeholder="Nome" className="h-8 rounded-lg border border-borda bg-superficie px-2 text-texto md:col-span-2" />
          <input value={fForm.prazo_dias ?? ""} onChange={(e) => setFForm({ ...fForm, prazo_dias: Number(e.target.value) })} placeholder="Prazo" inputMode="numeric" className="h-8 rounded-lg border border-borda bg-superficie px-2 text-texto" />
          <input value={fForm.seguranca_dias ?? ""} onChange={(e) => setFForm({ ...fForm, seguranca_dias: Number(e.target.value) })} placeholder="Segurança" inputMode="numeric" className="h-8 rounded-lg border border-borda bg-superficie px-2 text-texto" />
          <input value={fForm.caixa_padrao ?? ""} onChange={(e) => setFForm({ ...fForm, caixa_padrao: e.target.value ? Number(e.target.value) : null })} placeholder="Caixa" inputMode="numeric" className="h-8 rounded-lg border border-borda bg-superficie px-2 text-texto" />
          <div className="flex gap-2 md:col-span-5">
            <Botao pequeno variante="principal" disabled={ocupado} onClick={() => post({ fornecedor: fForm }).then(() => setFForm({ nome: "", prazo_dias: 15, seguranca_dias: 5 }))}>
              {fForm.id ? "Salvar" : "Adicionar fornecedor"}
            </Botao>
            {fForm.id && <Botao pequeno onClick={() => setFForm({ nome: "", prazo_dias: 15, seguranca_dias: 5 })}>Cancelar</Botao>}
          </div>
        </div>
        <div className="border-t border-borda px-[18px] py-3 text-[13px]">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-texto-2">Exceção por SKU</p>
          <div className="flex flex-wrap items-end gap-2">
            <input value={excForm.sku} onChange={(e) => setExcForm({ ...excForm, sku: e.target.value })} placeholder="SKU" className="h-8 rounded-lg border border-borda bg-superficie px-2 text-texto" />
            <select value={excForm.fornecedor_id} onChange={(e) => setExcForm({ ...excForm, fornecedor_id: e.target.value })} className="h-8 rounded-lg border border-borda bg-superficie px-2 text-texto">
              <option value="">fornecedor…</option>
              {fornecedores.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nome}
                </option>
              ))}
            </select>
            <input value={excForm.prazo_dias} onChange={(e) => setExcForm({ ...excForm, prazo_dias: e.target.value })} placeholder="Prazo" className="h-8 w-20 rounded-lg border border-borda bg-superficie px-2 text-texto" />
            <input value={excForm.seguranca_dias} onChange={(e) => setExcForm({ ...excForm, seguranca_dias: e.target.value })} placeholder="Seg." className="h-8 w-16 rounded-lg border border-borda bg-superficie px-2 text-texto" />
            <input value={excForm.caixa} onChange={(e) => setExcForm({ ...excForm, caixa: e.target.value })} placeholder="Caixa" className="h-8 w-16 rounded-lg border border-borda bg-superficie px-2 text-texto" />
            <Botao pequeno disabled={ocupado || !excForm.sku} onClick={() => post({ excecao: excForm })}>
              Salvar exceção
            </Botao>
          </div>
        </div>
      </Card>

      <div className="space-y-6">
        <Card>
          <CardHeader titulo="Compras a caminho" descricao="até as compras serem lançadas no módulo Compras do UpSeller, lance aqui o que já foi pedido" />
          {compras.length > 0 && (
            <ul className="mb-3 divide-y divide-linha text-[13px]">
              {compras.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2 py-1.5">
                  <span>
                    <b>{c.sku}</b> · {c.quantidade} un. {c.previsao ? `· chega ${new Date(c.previsao).toLocaleDateString("pt-BR", { timeZone: "UTC" })}` : ""} {c.observacao ? `· ${c.observacao}` : ""}
                  </span>
                  <Botao pequeno onClick={() => post({ compra_recebida: c.id })}>Recebido</Botao>
                </li>
              ))}
            </ul>
          )}
          <div className="grid grid-cols-2 gap-2 text-[13px] md:grid-cols-5">
            <input value={compraForm.sku} onChange={(e) => setCompraForm({ ...compraForm, sku: e.target.value })} placeholder="SKU" className="h-8 rounded-lg border border-borda bg-superficie px-2 text-texto" />
            <input value={compraForm.quantidade} onChange={(e) => setCompraForm({ ...compraForm, quantidade: e.target.value })} placeholder="Qtd" inputMode="numeric" className="h-8 rounded-lg border border-borda bg-superficie px-2 text-texto" />
            <input type="date" value={compraForm.previsao} onChange={(e) => setCompraForm({ ...compraForm, previsao: e.target.value })} className="h-8 rounded-lg border border-borda bg-superficie px-2 text-texto" />
            <select value={compraForm.fornecedor_id} onChange={(e) => setCompraForm({ ...compraForm, fornecedor_id: e.target.value })} className="h-8 rounded-lg border border-borda bg-superficie px-2 text-texto">
              <option value="">fornecedor…</option>
              {fornecedores.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nome}
                </option>
              ))}
            </select>
            <Botao pequeno variante="principal" disabled={ocupado || !compraForm.sku || !compraForm.quantidade} onClick={() => post({ compra: compraForm }).then(() => setCompraForm({ sku: "", quantidade: "", previsao: "", fornecedor_id: "", observacao: "" }))}>
              Lançar a caminho
            </Botao>
          </div>
        </Card>
        <Card>
          <CardHeader titulo="Fator sazonal" descricao="usado enquanto não há o ano anterior: multiplica a venda média no período (ex.: Black Friday 1,8×)" />
          {fatores.length > 0 && (
            <ul className="mb-3 divide-y divide-linha text-[13px]">
              {fatores.map((f) => (
                <li key={f.id} className="flex items-center justify-between gap-2 py-1.5">
                  <span>
                    <b>{f.nome}</b> · {f.inicio} → {f.fim} · {f.fator}×
                  </span>
                  <Botao pequeno variante="destrutivo" onClick={() => post({ apagar_fator: f.id })}>Apagar</Botao>
                </li>
              ))}
            </ul>
          )}
          <div className="grid grid-cols-2 gap-2 text-[13px] md:grid-cols-5">
            <input value={fatorForm.nome} onChange={(e) => setFatorForm({ ...fatorForm, nome: e.target.value })} placeholder="Nome (Black Friday)" className="h-8 rounded-lg border border-borda bg-superficie px-2 text-texto md:col-span-2" />
            <input type="date" value={fatorForm.inicio} onChange={(e) => setFatorForm({ ...fatorForm, inicio: e.target.value })} className="h-8 rounded-lg border border-borda bg-superficie px-2 text-texto" />
            <input type="date" value={fatorForm.fim} onChange={(e) => setFatorForm({ ...fatorForm, fim: e.target.value })} className="h-8 rounded-lg border border-borda bg-superficie px-2 text-texto" />
            <input value={fatorForm.fator} onChange={(e) => setFatorForm({ ...fatorForm, fator: e.target.value })} placeholder="1,5" className="h-8 rounded-lg border border-borda bg-superficie px-2 text-texto" />
            <Botao pequeno variante="principal" disabled={ocupado || !fatorForm.inicio || !fatorForm.fim} onClick={() => post({ fator: { ...fatorForm, fator: Number(fatorForm.fator.replace(",", ".")) } }).then(() => setFatorForm({ nome: "", inicio: "", fim: "", fator: "1.5" }))}>
              Adicionar período
            </Botao>
          </div>
        </Card>
        {msg && <p className="text-xs text-texto-2">{msg}</p>}
      </div>
    </div>
  );
}
