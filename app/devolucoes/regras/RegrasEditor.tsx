"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader, Chip, Switch, Botao, Segmentado, Tabela, Th, Tr, Td } from "../../components/ui";

type Regra = { id: string; conta_id: string | null; ordem: number; ativa: boolean; nome: string; condicao: Record<string, unknown>; acao: Record<string, unknown>; modo: string; usos30: number };
const MODO: Record<string, { nome: string; cor: "verde" | "amarelo" | "cinza" }> = { automatico: { nome: "Automático", cor: "verde" }, aprovar: { nome: "Pede aprovação", cor: "amarelo" }, sugerir: { nome: "Só sugere", cor: "cinza" } };
const ACAO: Record<string, string> = { aprovar: "Aprovar a devolução", disputar: "Abrir disputa", recusar: "Recusar", oferecer_parcial: "Oferecer reembolso parcial", alerta: "Alerta no Telegram", tarefa_inspecao: "Criar tarefa de inspeção", marcar_suspeito: "Marcar comprador como suspeito", cobrar_credito: "Alerta e texto de cobrança", aceitar_contraproposta: "Aceitar contraproposta" };

function descCondicao(c: Record<string, unknown>) {
  const p: string[] = [];
  if (c.motivo_in) p.push(`motivo ${(c.motivo_in as string[]).slice(0, 2).join("/")}${(c.motivo_in as string[]).length > 2 ? "…" : ""}`);
  if (c.valor_max !== undefined) p.push(`até R$ ${c.valor_max}`);
  if (c.valor_min !== undefined) p.push(`a partir de R$ ${c.valor_min}`);
  if (c.lacrado) p.push("produto lacrado");
  if (c.chegou) p.push("pacote chegou");
  if (c.item_diferente) p.push("veio outro item");
  if (c.peso_abaixo_pct !== undefined) p.push(`peso ${c.peso_abaixo_pct}% abaixo`);
  if (c.nao_recebido_com_entrega) p.push("'não recebido' com entrega confirmada e foto");
  if (c.prazo_horas_max !== undefined) p.push(`prazo < ${c.prazo_horas_max} h`);
  if (c.devolucoes_90d_min !== undefined) p.push(`comprador com ${c.devolucoes_90d_min}+ devoluções em 90 d`);
  if (c.disputa_ganha_sem_credito_dias !== undefined) p.push(`disputa ganha sem crédito há ${c.disputa_ganha_sem_credito_dias} d`);
  if (c.canal) p.push(String(c.canal));
  if (c.etapa_in) p.push(`etapa ${(c.etapa_in as string[]).join("/")}`);
  return p.join(" · ") || "(sem condição)";
}
function descAcao(a: Record<string, unknown>) {
  const base = ACAO[String(a.tipo)] ?? String(a.tipo);
  const extra = a.valor_parcial_pct ? ` de ${a.valor_parcial_pct}%` : "";
  const provas = Array.isArray(a.provas) && a.provas.length ? ` com ${(a.provas as string[]).join(" + ").replace(/_/g, " ")}` : "";
  return base + extra + provas;
}

export default function RegrasEditor({ regras, modoAssistente, acoesApi, admin }: { regras: Regra[]; modoAssistente: "sugerir" | "aprovar"; acoesApi: boolean; admin: boolean }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [editando, setEditando] = useState<Regra | null>(null);
  const [nova, setNova] = useState(false);
  const [form, setForm] = useState({ nome: "", condicao: "{}", acao: "{\"tipo\":\"aprovar\"}", modo: "aprovar", ordem: "100" });
  const [erro, setErro] = useState<string | null>(null);

  async function post(body: Record<string, unknown>, chave: string) {
    setOcupado(chave);
    setErro(null);
    const r = await fetch("/api/devolucoes/regras", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await r.json();
    if (!d.sucesso) setErro(d.erro || "Erro.");
    setOcupado(null);
    router.refresh();
    return d;
  }

  function abrirEdicao(r: Regra) {
    setEditando(r);
    setNova(false);
    setForm({ nome: r.nome, condicao: JSON.stringify(r.condicao, null, 1), acao: JSON.stringify(r.acao, null, 1), modo: r.modo, ordem: String(r.ordem) });
  }
  async function salvarForm() {
    let condicao: unknown;
    let acao: unknown;
    try {
      condicao = JSON.parse(form.condicao);
      acao = JSON.parse(form.acao);
    } catch {
      setErro("Condição ou ação não é um JSON válido.");
      return;
    }
    const body = nova ? { nova: { nome: form.nome, condicao, acao, modo: form.modo, ordem: Number(form.ordem) } } : { id: editando!.id, nome: form.nome, condicao, acao, modo: form.modo, ordem: Number(form.ordem) };
    const d = await post(body, "form");
    if (d.sucesso) {
      setEditando(null);
      setNova(false);
    }
  }

  return (
    <>
      <Card>
        <CardHeader titulo="Como o assistente trabalha" descricao="vale para casos sem regra específica" />
        <Segmentado rotulo="Modo do assistente" ativa={modoAssistente} onChange={(id) => admin && post({ modo_assistente: id }, "modo")} opcoes={[{ id: "sugerir", nome: "Só sugerir" }, { id: "aprovar", nome: "Pedir aprovação no Telegram" }]} />
        <p className="mt-2 text-xs text-texto-2">{modoAssistente === "aprovar" ? "Sugestões com confiança média ou alta viram pedido de aprovação no Telegram." : "O assistente só mostra a sugestão na fila e no caso; você decide."}{!acoesApi ? " Ações pela API desligadas: nada é enviado às plataformas." : ""}</p>
      </Card>

      <Card semPadding>
        <CardHeader className="px-[18px] pt-4" titulo="Regras" descricao="a ordem importa: a primeira que bater vale" acoes={admin ? <Botao pequeno variante="principal" onClick={() => { setNova(true); setEditando(null); setForm({ nome: "", condicao: "{\n \"valor_max\": 60\n}", acao: "{\n \"tipo\": \"aprovar\"\n}", modo: "aprovar", ordem: "100" }); }}>+ Nova regra</Botao> : undefined} />
        <Tabela>
          <thead>
            <tr>
              <Th>Ativa</Th>
              <Th>Quando</Th>
              <Th>Então</Th>
              <Th>Modo</Th>
              <Th numerica>Usada em 30 d</Th>
              <Th></Th>
            </tr>
          </thead>
          <tbody>
            {regras.map((r) => (
              <Tr key={r.id} selecionada={editando?.id === r.id}>
                <Td>
                  <Switch ligado={r.ativa} desabilitado={!admin || ocupado === r.id} onChange={(v) => post({ id: r.id, ativa: v }, r.id)} />
                </Td>
                <Td>
                  <p className="font-medium text-texto">{r.nome}</p>
                  <p className="text-xs text-texto-2">{descCondicao(r.condicao)}{r.conta_id === null ? " · padrão" : ""}</p>
                </Td>
                <Td className="text-texto">{descAcao(r.acao)}</Td>
                <Td>
                  <Chip cor={MODO[r.modo]?.cor ?? "cinza"}>{MODO[r.modo]?.nome ?? r.modo}</Chip>
                </Td>
                <Td numerica>{r.usos30 || "—"}</Td>
                <Td>{admin && <Botao pequeno onClick={() => abrirEdicao(r)}>Editar</Botao>}</Td>
              </Tr>
            ))}
          </tbody>
        </Tabela>
        {erro && <p className="px-[18px] py-2 text-xs text-perigo">{erro}</p>}
      </Card>

      {(editando || nova) && (
        <Card>
          <CardHeader titulo={nova ? "Nova regra" : `Editar · ${editando?.nome}`} descricao="condição e ação em JSON (campos: motivo_in, valor_max, lacrado, chegou, item_diferente, peso_abaixo_pct, nao_recebido_com_entrega, prazo_horas_max, devolucoes_90d_min, disputa_ganha_sem_credito_dias, canal, etapa_in; ação: tipo, valor_parcial_pct, provas, mensagem)" />
          <div className="grid grid-cols-1 gap-3 text-[13px] md:grid-cols-2">
            <label className="md:col-span-2">
              <span className="mb-1 block font-medium text-texto">Nome</span>
              <input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} className="h-9 w-full rounded-lg border border-borda bg-superficie px-2 text-texto" />
            </label>
            <label>
              <span className="mb-1 block font-medium text-texto">Quando (condição)</span>
              <textarea value={form.condicao} onChange={(e) => setForm({ ...form, condicao: e.target.value })} rows={6} className="w-full rounded-lg border border-borda bg-superficie p-2 font-mono text-xs text-texto" />
            </label>
            <label>
              <span className="mb-1 block font-medium text-texto">Então (ação)</span>
              <textarea value={form.acao} onChange={(e) => setForm({ ...form, acao: e.target.value })} rows={6} className="w-full rounded-lg border border-borda bg-superficie p-2 font-mono text-xs text-texto" />
            </label>
            <label>
              <span className="mb-1 block font-medium text-texto">Modo</span>
              <select value={form.modo} onChange={(e) => setForm({ ...form, modo: e.target.value })} className="h-9 w-full rounded-lg border border-borda bg-superficie px-2 text-texto">
                <option value="sugerir">Só sugerir</option>
                <option value="aprovar">Pedir aprovação</option>
                <option value="automatico">Automático (dentro dos limites)</option>
              </select>
            </label>
            <label>
              <span className="mb-1 block font-medium text-texto">Ordem</span>
              <input value={form.ordem} onChange={(e) => setForm({ ...form, ordem: e.target.value })} inputMode="numeric" className="h-9 w-32 rounded-lg border border-borda bg-superficie px-2 text-texto" />
            </label>
          </div>
          <div className="mt-3 flex gap-2">
            <Botao variante="principal" disabled={ocupado === "form"} onClick={salvarForm}>
              Salvar
            </Botao>
            <Botao onClick={() => { setEditando(null); setNova(false); }}>Cancelar</Botao>
            {editando && editando.conta_id && (
              <Botao variante="destrutivo" onClick={() => post({ apagar: editando.id }, "apagar").then(() => setEditando(null))}>
                Apagar
              </Botao>
            )}
          </div>
        </Card>
      )}
    </>
  );
}
