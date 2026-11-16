"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader, Botao, Aviso, Dica } from "../../components/ui";

// Ações de um caso de falha de entrega (sem disputa pela API):
//  - "Validado, voltou ao estoque"  → inspeção OK e caso encerrado
//  - "Problema no pacote: abrir chamado na Shopee" → texto pronto (pedido, rastreio da volta, fotos, peso)
export default function AcoesFalhaEntrega({ id, pedido, rastreio, transportadora, chegouEm, fotos, pesoEnvioKg, metaDias, encerrado }: {
  id: string;
  pedido: string;
  rastreio: string | null;
  transportadora: string | null;
  chegouEm: string | null;
  fotos: string[];
  pesoEnvioKg: number | null;
  metaDias: number;
  encerrado: boolean;
}) {
  const router = useRouter();
  const [peso, setPeso] = useState("");
  const [obs, setObs] = useState("");
  const [texto, setTexto] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const enviar = async (acao: "validado" | "chamado") => {
    setOcupado(true);
    setErro(null);
    try {
      const r = await fetch(`/api/devolucoes/${id}/falha-entrega`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acao, peso_chegada_kg: peso ? Number(peso.replace(",", ".")) : null, observacao: obs || undefined }) });
      const j = await r.json();
      if (!j.sucesso) throw new Error(j.erro || "Falhou");
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setOcupado(false);
    }
  };

  const gerarTexto = () => {
    const linhas = [
      `Pedido ${pedido} — falha de entrega, pacote devolvido ao vendedor${chegouEm ? ` em ${new Date(chegouEm).toLocaleDateString("pt-BR")}` : ""}.`,
      `Rastreio da volta: ${rastreio ?? "-"}${transportadora ? ` (${transportadora})` : ""}.`,
      `Peso na chegada: ${peso || "-"} kg${pesoEnvioKg ? ` (no envio: ${pesoEnvioKg} kg)` : ""}.`,
      `Problema encontrado: ${obs || "(descreva o problema: embalagem violada, item faltando, item danificado...)"}`,
      fotos.length ? `Fotos (${fotos.length}): ${fotos.join(" ")}` : "Fotos: (anexar as fotos da inspeção)",
      "Solicito a análise da Shopee e o ressarcimento conforme a política de falhas de entrega.",
    ];
    setTexto(linhas.join("\n"));
  };

  if (encerrado) return null;
  return (
    <Card>
      <CardHeader titulo="Falha de entrega: validar o pacote" descricao={`meta interna: validar em até ${metaDias} dias após a chegada · sem disputa pela API para este tipo`} />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="text-xs text-texto-2">
          Peso na chegada (kg)
          <input className="mt-1 w-full rounded-lg border border-borda bg-superficie p-2 text-sm text-texto" value={peso} onChange={(e) => setPeso(e.target.value)} placeholder="ex.: 0,850" />
        </label>
        <label className="text-xs text-texto-2">
          Observação
          <input className="mt-1 w-full rounded-lg border border-borda bg-superficie p-2 text-sm text-texto" value={obs} onChange={(e) => setObs(e.target.value)} placeholder="opcional" />
        </label>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Botao variante="principal" onClick={() => enviar("validado")} disabled={ocupado}>Validado, voltou ao estoque</Botao>
        <Botao variante="secundario" onClick={gerarTexto} disabled={ocupado}>Problema no pacote: abrir chamado na Shopee</Botao>
      </div>
      {texto && (
        <div className="mt-3">
          <textarea readOnly className="h-40 w-full rounded-lg border border-borda bg-superficie-2 p-2 text-xs text-texto" value={texto} />
          <div className="mt-2 flex flex-wrap gap-2">
            <Botao variante="secundario" onClick={() => navigator.clipboard?.writeText(texto)}>Copiar texto</Botao>
            <Botao variante="principal" onClick={() => enviar("chamado")} disabled={ocupado}>Registrar que o chamado foi aberto</Botao>
          </div>
          <Dica className="mt-2">Abra o chamado no Seller Center (Central de Ajuda → Falha de entrega) com este texto e as fotos; aqui o caso fica em Aguardando plataforma.</Dica>
        </div>
      )}
      {erro && <Aviso className="mt-3">{erro}</Aviso>}
    </Card>
  );
}
