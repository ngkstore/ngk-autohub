"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader, Botao, Aviso, Dica } from "../../components/ui";

type Permitidas = { permitidas: string[]; motivos: { id: string | number; texto: string }[] };
type Decisao = "aprovar" | "recusar" | "disputar" | "oferecer_parcial" | "aceitar_contraproposta" | "enviar_provas" | "aguardar";

const DECISOES: { id: Decisao; nome: string }[] = [
  { id: "aprovar", nome: "Aprovar devolução" },
  { id: "disputar", nome: "Recusar / abrir disputa com prova" },
  { id: "oferecer_parcial", nome: "Oferecer reembolso parcial" },
  { id: "aceitar_contraproposta", nome: "Aceitar contraproposta" },
  { id: "enviar_provas", nome: "Só enviar provas" },
  { id: "aguardar", nome: "Aguardar" },
];

// Formulário de resposta (B7): decisão, motivo oficial, mensagem editável,
// "Revisar e enviar" (executa como aprovado pelo usuário; respeita a flag) e
// "Mandar para aprovação no Telegram".
export default function ResponderCaso({ id, canal, etapa, sugestao, valorReembolso, quadros, pendente }: {
  id: string;
  canal: "shopee" | "tiktok";
  etapa: string;
  sugestao: { decisao: string; motivo_plataforma: string | number | null; valor_parcial: number | null; mensagem: string } | null;
  valorReembolso: number;
  quadros: { id: string; storage_path: string | null; legenda: string | null; url: string | null }[];
  pendente: { id: string; acao: string; via: string } | null;
}) {
  const router = useRouter();
  const inicial = (sugestao?.decisao === "recusar" ? "disputar" : (sugestao?.decisao as Decisao)) || "aguardar";
  const [decisao, setDecisao] = useState<Decisao>(inicial);
  const [motivo, setMotivo] = useState<string>(sugestao?.motivo_plataforma != null ? String(sugestao.motivo_plataforma) : "");
  const [valor, setValor] = useState<string>(sugestao?.valor_parcial ? String(sugestao.valor_parcial) : "");
  const [mensagem, setMensagem] = useState(sugestao?.mensagem || "");
  const [imagens, setImagens] = useState<string[]>([]);
  const [perm, setPerm] = useState<Permitidas | null>(null);
  const [permErro, setPermErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [resultado, setResultado] = useState<{ ok: boolean; texto: string } | null>(null);
  const [revisar, setRevisar] = useState(false);

  useEffect(() => {
    if (etapa === "encerrado") return;
    fetch(`/api/devolucoes/${id}/acoes`)
      .then((r) => r.json())
      .then((d) => (d.sucesso ? setPerm(d) : setPermErro(d.erro || "Não foi possível consultar a plataforma.")))
      .catch(() => setPermErro("Não foi possível consultar a plataforma."));
  }, [id, etapa]);

  const acao = () => ({
    tipo: decisao,
    motivo_plataforma: motivo || null,
    texto: mensagem || null,
    valor_parcial: valor ? Number(valor.replace(",", ".")) : null,
    imagens: imagens.length ? imagens : undefined,
  });

  async function enviar(modo: "executar" | "telegram") {
    setOcupado(true);
    setResultado(null);
    const url = modo === "executar" ? `/api/devolucoes/${id}/acoes` : `/api/devolucoes/${id}/aprovacao`;
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acao: acao() }) });
    const d = await r.json();
    if (modo === "executar") setResultado({ ok: !!d.enviado, texto: d.enviado ? "Enviado à plataforma." : d.motivo || d.erro || "Não enviado." });
    else setResultado({ ok: !!d.sucesso, texto: d.sucesso ? "Pedido de aprovação enviado ao Telegram." : d.erro || "Erro." });
    setOcupado(false);
    setRevisar(false);
    router.refresh();
  }

  if (etapa === "encerrado") return null;
  const precisaMotivo = decisao === "disputar";
  const precisaValor = decisao === "oferecer_parcial";

  return (
    <Card>
      <CardHeader titulo="Responder" descricao="nada é enviado sem confirmar" />
      {pendente && <Dica className="mb-3">Há um pedido de aprovação aberto ({pendente.acao}, via {pendente.via}). Aprove no Telegram ou envie daqui.</Dica>}
      <div className="space-y-3 text-[13px]">
        <label className="block">
          <span className="mb-1 block font-medium text-texto">Decisão</span>
          <select value={decisao} onChange={(e) => setDecisao(e.target.value as Decisao)} className="h-9 w-full rounded-lg border border-borda bg-superficie px-2 text-texto">
            {DECISOES.filter((o) => !(canal === "tiktok" && (o.id === "aceitar_contraproposta" || o.id === "enviar_provas"))).map((o) => (
              <option key={o.id} value={o.id}>
                {o.nome}
                {sugestao && (o.id === inicial ? " · sugerido" : "")}
              </option>
            ))}
          </select>
        </label>
        {perm && perm.permitidas.length > 0 && <p className="text-xs text-texto-2">A plataforma permite agora: {perm.permitidas.join(", ")}.</p>}
        {permErro && <p className="text-xs text-alerta">{permErro}</p>}
        {precisaMotivo && (
          <label className="block">
            <span className="mb-1 block font-medium text-texto">Motivo oficial</span>
            {perm?.motivos?.length ? (
              <select value={motivo} onChange={(e) => setMotivo(e.target.value)} className="h-9 w-full rounded-lg border border-borda bg-superficie px-2 text-texto">
                <option value="">Escolha…</option>
                {perm.motivos.map((m) => (
                  <option key={String(m.id)} value={String(m.id)}>
                    {m.texto}
                  </option>
                ))}
              </select>
            ) : (
              <input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="id do motivo (lista oficial não carregou)" className="h-9 w-full rounded-lg border border-borda bg-superficie px-2 text-texto" />
            )}
          </label>
        )}
        {precisaValor && (
          <label className="block">
            <span className="mb-1 block font-medium text-texto">Valor parcial (R$) · reembolso pedido R$ {valorReembolso.toFixed(2)}</span>
            <input value={valor} onChange={(e) => setValor(e.target.value)} inputMode="decimal" className="h-9 w-40 rounded-lg border border-borda bg-superficie px-2 text-texto" />
          </label>
        )}
        {(decisao === "disputar" || decisao === "enviar_provas" || decisao === "oferecer_parcial") && (
          <div>
            <span className="mb-1 block font-medium text-texto">Provas (quadros do vídeo e fotos)</span>
            {quadros.length === 0 ? (
              <p className="text-xs text-texto-2">Nenhuma prova nossa ainda. Capture quadros no Recebimento e inspeção.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {quadros.map((q) => {
                  const ref = q.storage_path || q.url || "";
                  const on = imagens.includes(ref);
                  return (
                    <button key={q.id} type="button" onClick={() => setImagens(on ? imagens.filter((i) => i !== ref) : [...imagens, ref].slice(0, 6))} className={`overflow-hidden rounded-[10px] border-2 ${on ? "border-primaria" : "border-transparent"}`} title={q.legenda ?? ""}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {q.url ? <img src={q.url} alt={q.legenda ?? ""} className="h-16 w-16 object-cover" /> : <span className="block h-16 w-16 bg-superficie-2" />}
                    </button>
                  );
                })}
              </div>
            )}
            <p className="mt-1 text-[11px] text-texto-2">Até 6 imagens. O vídeo inteiro não vai pela API (fica no caso para o Seller Center).</p>
          </div>
        )}
        <label className="block">
          <span className="mb-1 block font-medium text-texto">Mensagem ao comprador</span>
          <textarea value={mensagem} onChange={(e) => setMensagem(e.target.value)} rows={3} className="w-full rounded-lg border border-borda bg-superficie p-2 text-texto" />
        </label>
        {revisar ? (
          <Aviso>
            Vai enviar <b>{DECISOES.find((o) => o.id === decisao)?.nome}</b>
            {motivo ? ` · motivo ${motivo}` : ""}
            {valor ? ` · R$ ${valor}` : ""} para a plataforma. Confirma?
            <div className="mt-2 flex gap-2">
              <Botao variante="principal" pequeno disabled={ocupado} onClick={() => enviar("executar")}>
                {ocupado ? "Enviando…" : "Confirmar e enviar"}
              </Botao>
              <Botao pequeno onClick={() => setRevisar(false)}>Voltar</Botao>
            </div>
          </Aviso>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Botao variante="principal" disabled={ocupado || decisao === "aguardar"} onClick={() => setRevisar(true)}>
              Revisar e enviar
            </Botao>
            <Botao disabled={ocupado || decisao === "aguardar"} onClick={() => enviar("telegram")}>
              Mandar para aprovação no Telegram
            </Botao>
          </div>
        )}
        {resultado && <p className={`text-xs ${resultado.ok ? "text-sucesso" : "text-alerta"}`}>{resultado.texto}</p>}
      </div>
    </Card>
  );
}
