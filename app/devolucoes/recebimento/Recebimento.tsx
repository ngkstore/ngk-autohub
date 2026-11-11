"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { criarSupabaseBrowser } from "@/lib/supabase/client";
import { Card, CardHeader, Chip, ChipCanal, Botao, Aviso, Dica, Tabela, Th, Tr, Td } from "../../components/ui";

type Caso = { id: string; canal: "shopee" | "tiktok"; plataforma_id: string; pedido_id: string; etapa: string; motivo: string | null; itens: { sku: string | null; nome: string | null; quantidade: number }[] | null; rastreio: string | null; chegou_em: string | null; loja: string | null; valor?: number };
type Prova = { id: string; tipo: string; url: string | null; legenda: string | null };
const ESTADOS = [
  { id: "novo", nome: "Novo, sem uso", destino: "Volta para o estoque disponível" },
  { id: "usado", nome: "Usado, sem defeito", destino: "Vai para estoque de saldo/outlet" },
  { id: "defeito", nome: "Com defeito ou quebrado", destino: "Vai para avaria · gera pedido de garantia ao fornecedor" },
  { id: "diferente_ou_faltando", nome: "Diferente ou faltando peça", destino: "Abre contestação com as provas" },
];
const FOTOS_OBRIGATORIAS = [
  { id: "caixa_fechada", nome: "Caixa fechada com etiqueta" },
  { id: "balanca", nome: "Pacote na balança" },
  { id: "video_abertura", nome: "Vídeo contínuo da abertura", video: true },
  { id: "conteudo", nome: "O que veio dentro" },
];

// B5 — Recebimento e inspeção: bipe (leitor = teclado + Enter), peso, checklist,
// vídeo da abertura com quadros no navegador (<video> + <canvas>), estado → destino.
export default function Recebimento({ fila, termoInicial }: { fila: Caso[]; termoInicial: string }) {
  const router = useRouter();
  const [termo, setTermo] = useState(termoInicial);
  const [resultados, setResultados] = useState<Caso[]>([]);
  const [caso, setCaso] = useState<Caso | null>(null);
  const [pesoEnvio, setPesoEnvio] = useState("");
  const [pesoChegada, setPesoChegada] = useState("");
  const [checklist, setChecklist] = useState<{ nome: string; ok: boolean }[]>([]);
  const [estado, setEstado] = useState<string>("");
  const [obs, setObs] = useState("");
  const [provas, setProvas] = useState<Prova[]>([]);
  const [enviando, setEnviando] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoPath, setVideoPath] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoId, setVideoId] = useState<string | null>(null);

  async function buscar(t: string) {
    const q = t.trim();
    if (!q) return;
    const r = await fetch(`/api/devolucoes/buscar?q=${encodeURIComponent(q)}`);
    const d = await r.json();
    const lista: Caso[] = d.resultados || [];
    setResultados(lista);
    if (lista.length === 1) abrir(lista[0]);
  }

  useEffect(() => {
    if (!termoInicial) return;
    const t = setTimeout(() => buscar(termoInicial), 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function abrir(c: Caso) {
    setCaso(c);
    setMsg(null);
    setEstado("");
    setObs("");
    setPesoChegada("");
    setChecklist((c.itens || []).map((i) => ({ nome: `${i.nome ?? i.sku ?? "item"} (${i.quantidade} un.)`, ok: false })).concat([{ nome: "Embalagem original", ok: false }, { nome: "Manual / acessórios", ok: false }]));
    const r = await fetch(`/api/devolucoes/${c.id}/inspecao`);
    const d = await r.json();
    if (d.inspecao) {
      setPesoEnvio(d.inspecao.peso_envio_kg ?? "");
      setPesoChegada(d.inspecao.peso_chegada_kg ?? "");
      setEstado(d.inspecao.estado ?? "");
      setObs(d.inspecao.observacao ?? "");
      if (Array.isArray(d.inspecao.itens)) setChecklist(d.inspecao.itens);
    } else setPesoEnvio("");
    if (!c.chegou_em) {
      await fetch(`/api/devolucoes/${c.id}/inspecao`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chegou: true }) });
      router.refresh();
    }
  }

  async function subir(file: File, finalidade: string, tipo: "foto" | "video", legenda: string): Promise<Prova | null> {
    if (!caso) return null;
    if (tipo === "video" && file.size > 250 * 1024 * 1024) {
      setMsg("Vídeo acima de 250 MB. Grave em até 3 minutos.");
      return null;
    }
    setEnviando(finalidade);
    try {
      const r = await fetch(`/api/devolucoes/${caso.id}/upload-url`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tipo_arquivo: file.type || (tipo === "video" ? "video/mp4" : "image/jpeg"), finalidade }) });
      const u = await r.json();
      if (!u.sucesso) throw new Error(u.erro);
      const sb = criarSupabaseBrowser();
      const up = await sb.storage.from("devolucoes").uploadToSignedUrl(u.path, u.token, file, { contentType: file.type || undefined });
      if (up.error) throw new Error(up.error.message);
      const reg = await fetch(`/api/devolucoes/${caso.id}/midia`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ storage_path: u.path, tipo, legenda }) });
      const m = await reg.json();
      if (!m.sucesso) throw new Error(m.erro);
      const p = { id: m.id, tipo, url: m.url, legenda };
      setProvas((x) => [...x, p]);
      if (tipo === "video") {
        setVideoUrl(URL.createObjectURL(file));
        setVideoPath(u.path);
        setVideoId(m.id);
      }
      return p;
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Falha no envio.");
      return null;
    } finally {
      setEnviando(null);
    }
  }

  async function capturarQuadro(segundo?: number) {
    const v = videoRef.current;
    if (!v || !caso || !videoId) return;
    if (segundo !== undefined) {
      v.currentTime = segundo;
      await new Promise((ok) => {
        const h = () => {
          v.removeEventListener("seeked", h);
          ok(null);
        };
        v.addEventListener("seeked", h);
      });
    }
    const canvas = document.createElement("canvas");
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    canvas.getContext("2d")?.drawImage(v, 0, 0);
    const blob: Blob | null = await new Promise((ok) => canvas.toBlob(ok, "image/jpeg", 0.88));
    if (!blob) return;
    const seg = Math.round(v.currentTime * 10) / 10;
    setEnviando("quadro");
    try {
      const r = await fetch(`/api/devolucoes/${caso.id}/upload-url`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tipo_arquivo: "image/jpeg", finalidade: "quadro" }) });
      const u = await r.json();
      const sb = criarSupabaseBrowser();
      const up = await sb.storage.from("devolucoes").uploadToSignedUrl(u.path, u.token, blob, { contentType: "image/jpeg" });
      if (up.error) throw new Error(up.error.message);
      const reg = await fetch(`/api/devolucoes/${caso.id}/midia`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ storage_path: u.path, tipo: "quadro", legenda: `quadro da abertura aos ${seg} s`, quadro_do_video: videoId, segundo_no_video: seg }) });
      const m = await reg.json();
      if (m.sucesso) setProvas((x) => [...x, { id: m.id, tipo: "quadro", url: m.url, legenda: `quadro ${seg} s` }]);
    } finally {
      setEnviando(null);
    }
  }

  async function quadrosAutomaticos() {
    const v = videoRef.current;
    if (!v || !v.duration) return;
    for (const f of [0.02, 0.25, 0.5, 0.98]) await capturarQuadro(v.duration * f);
  }

  async function salvar(concluir: boolean) {
    if (!caso) return;
    if (concluir && !estado) {
      setMsg("Escolha o estado do produto.");
      return;
    }
    setEnviando("salvar");
    const r = await fetch(`/api/devolucoes/${caso.id}/inspecao`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ peso_envio_kg: pesoEnvio ? Number(String(pesoEnvio).replace(",", ".")) : null, peso_chegada_kg: pesoChegada ? Number(String(pesoChegada).replace(",", ".")) : null, itens: checklist, estado: estado || undefined, observacao: obs, concluir }),
    });
    const d = await r.json();
    setEnviando(null);
    setMsg(d.sucesso ? (concluir ? `Inspeção concluída · destino: ${d.destino}. Tarefas do UpSeller criadas no caso.` : "Salvo.") : d.erro || "Erro.");
    router.refresh();
  }

  const pe = Number(String(pesoEnvio).replace(",", "."));
  const pc = Number(String(pesoChegada).replace(",", "."));
  const quedaPct = pe > 0 && pc > 0 ? Math.round(((pe - pc) / pe) * 100) : null;
  const temProva = (id: string) => provas.some((p) => p.legenda?.startsWith(id) || (id === "video_abertura" && p.tipo === "video"));
  const podeContestar = FOTOS_OBRIGATORIAS.every((f) => temProva(f.id));

  return (
    <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-5">
      <div className="space-y-6 xl:col-span-2">
        <Card>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              buscar(termo);
            }}
          >
            <label className="block text-[13px] font-medium text-texto">Bipar código de rastreio reverso, número do pedido ou da devolução</label>
            <input autoFocus value={termo} onChange={(e) => setTermo(e.target.value)} placeholder="Aponte o leitor e pressione Enter" className="mt-1 h-11 w-full rounded-lg border border-borda bg-superficie px-3 text-[15px] text-texto focus:border-primaria focus:outline-none" />
          </form>
          {resultados.length > 1 && (
            <ul className="mt-3 divide-y divide-linha">
              {resultados.map((c) => (
                <li key={c.id}>
                  <button type="button" onClick={() => abrir(c)} className="flex w-full items-center justify-between py-2 text-left text-[13px] hover:bg-superficie-2">
                    <span>
                      {c.itens?.[0]?.nome ?? c.pedido_id} <span className="text-texto-2">· {c.pedido_id}</span>
                    </span>
                    <ChipCanal canal={c.canal} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {resultados.length === 0 && termo && caso === null && <p className="mt-2 text-xs text-texto-2">Nada encontrado para “{termo}”.</p>}
          {caso && <Dica className="mt-3">Encontrado: devolução {caso.canal === "tiktok" ? "TikTok" : "Shopee"} {caso.plataforma_id} · {caso.itens?.[0]?.nome ?? caso.pedido_id}</Dica>}
        </Card>

        <Card semPadding>
          <CardHeader className="px-[18px] pt-4" titulo="Pacotes de devolução" descricao="mais antigos primeiro" />
          <Tabela>
            <thead>
              <tr>
                <Th>Produto</Th>
                <Th>Motivo</Th>
                <Th>Situação</Th>
              </tr>
            </thead>
            <tbody>
              {fila.length === 0 && (
                <Tr>
                  <Td colSpan={3} className="text-texto-2">Nenhum pacote voltando.</Td>
                </Tr>
              )}
              {fila.map((c) => (
                <Tr key={c.id} selecionada={caso?.id === c.id} onClick={() => abrir(c)}>
                  <Td>
                    <p className="font-medium">{c.itens?.[0]?.nome ?? c.pedido_id}</p>
                    <p className="text-xs text-texto-2">
                      {c.pedido_id} · {c.canal === "tiktok" ? "TikTok" : "Shopee"}
                    </p>
                  </Td>
                  <Td className="text-texto-2">{c.motivo ?? "-"}</Td>
                  <Td>
                    <Chip cor={c.chegou_em ? "verde" : c.rastreio ? "ceu" : "cinza"}>{c.chegou_em ? `chegou ${new Date(c.chegou_em).toLocaleDateString("pt-BR")}` : c.rastreio ? "em trânsito" : "sem rastreio"}</Chip>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Tabela>
        </Card>
      </div>

      <div className="xl:col-span-3">
        {!caso ? (
          <Card>
            <CardHeader titulo="Inspeção" />
            <p className="text-[13px] text-texto-2">Bipe um pacote ou escolha na lista para começar.</p>
          </Card>
        ) : (
          <Card>
            <CardHeader titulo={`Inspeção · ${caso.itens?.[0]?.nome ?? caso.pedido_id}`} acoes={<ChipCanal canal={caso.canal} />} />
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <div>
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-texto-2">O que devia voltar</p>
                <ul className="space-y-1.5">
                  {checklist.map((i, idx) => (
                    <li key={idx}>
                      <label className="flex items-center gap-2 text-[13px] text-texto">
                        <input type="checkbox" checked={i.ok} onChange={(e) => setChecklist(checklist.map((x, j) => (j === idx ? { ...x, ok: e.target.checked } : x)))} />
                        {i.nome}
                      </label>
                    </li>
                  ))}
                </ul>
                <p className="mt-4 mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-texto-2">Estado do produto</p>
                <div className="space-y-1.5">
                  {ESTADOS.map((e) => (
                    <label key={e.id} className={`flex cursor-pointer items-start gap-2 rounded-[10px] border p-2 text-[13px] ${estado === e.id ? "border-primaria bg-primaria-suave" : "border-linha"}`}>
                      <input type="radio" name="estado" checked={estado === e.id} onChange={() => setEstado(e.id)} className="mt-0.5" />
                      <span>
                        <span className="font-medium text-texto">{e.nome}</span>
                        <span className="block text-xs text-texto-2">{e.destino}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-texto-2">Peso</p>
                <div className="flex items-end gap-3">
                  <label className="text-[13px] text-texto">
                    <span className="block text-xs text-texto-2">Envio (kg)</span>
                    <input value={pesoEnvio} onChange={(e) => setPesoEnvio(e.target.value)} inputMode="decimal" className="h-9 w-24 rounded-lg border border-borda bg-superficie px-2" />
                  </label>
                  <label className="text-[13px] text-texto">
                    <span className="block text-xs text-texto-2">Chegada (kg)</span>
                    <input value={pesoChegada} onChange={(e) => setPesoChegada(e.target.value)} inputMode="decimal" className="h-9 w-24 rounded-lg border border-borda bg-superficie px-2" />
                  </label>
                  {quedaPct !== null && <Chip cor={quedaPct >= 20 ? "vermelho" : "verde"}>{quedaPct >= 20 ? `${quedaPct}% abaixo · sugere disputa` : "confere"}</Chip>}
                </div>
                <p className="mt-4 mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-texto-2">Provas da abertura</p>
                <Dica className="mb-2">Grave em plano contínuo, sem cortes, começando com a caixa fechada e a etiqueta legível, com a balança em cena.</Dica>
                <ul className="space-y-1.5">
                  {FOTOS_OBRIGATORIAS.map((f) => (
                    <li key={f.id} className="flex items-center justify-between gap-2 text-[13px] text-texto">
                      <span>
                        {temProva(f.id) ? "✅" : "⬜"} {f.nome}
                      </span>
                      <label className={`cursor-pointer rounded-lg border border-borda px-2 py-1 text-xs ${enviando === f.id ? "opacity-50" : "hover:bg-superficie-2"}`}>
                        {enviando === f.id ? "enviando…" : f.video ? "escolher vídeo" : "foto"}
                        <input type="file" accept={f.video ? "video/mp4,video/quicktime" : "image/*"} capture={f.video ? undefined : "environment"} className="hidden" onChange={(e) => e.target.files?.[0] && subir(e.target.files[0], f.id, f.video ? "video" : "foto", f.video ? "video_abertura" : `${f.id}: ${f.nome}`)} />
                      </label>
                    </li>
                  ))}
                </ul>
                {videoUrl && (
                  <div className="mt-3">
                    <video ref={videoRef} src={videoUrl} controls className="w-full rounded-[10px] bg-black" />
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Botao pequeno onClick={() => capturarQuadro()} disabled={enviando === "quadro"}>
                        Capturar quadro agora
                      </Botao>
                      <Botao pequeno onClick={quadrosAutomaticos} disabled={enviando === "quadro"}>
                        4 quadros automáticos (início, 25%, 50%, fim)
                      </Botao>
                    </div>
                    <p className="mt-1 text-[11px] text-texto-2">{videoPath ? "O vídeo fica no caso. Pela API vão os quadros (o TikTok só aceita foto do vendedor); o vídeo inteiro fica pronto para o Seller Center." : ""}</p>
                  </div>
                )}
                {provas.filter((p) => p.tipo !== "video").length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {provas
                      .filter((p) => p.tipo !== "video" && p.url)
                      .map((p) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img key={p.id} src={p.url!} alt={p.legenda ?? ""} title={p.legenda ?? ""} className="h-14 w-14 rounded-lg object-cover" />
                      ))}
                  </div>
                )}
              </div>
            </div>
            <label className="mt-4 block text-[13px] text-texto">
              <span className="mb-1 block font-medium">Observação</span>
              <textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={2} className="w-full rounded-lg border border-borda bg-superficie p-2" />
            </label>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Botao variante="principal" disabled={!!enviando} onClick={() => salvar(true)}>
                {estado === "diferente_ou_faltando" ? "Concluir e preparar contestação" : estado ? `Concluir: ${ESTADOS.find((e) => e.id === estado)?.destino}` : "Concluir inspeção"}
              </Botao>
              <Botao disabled={!!enviando} onClick={() => salvar(false)}>
                Salvar parcial
              </Botao>
              {estado === "diferente_ou_faltando" && !podeContestar && <Aviso>Para abrir contestação faltam provas: caixa fechada com etiqueta, pacote na balança, vídeo da abertura e o que veio dentro.</Aviso>}
            </div>
            <p className="mt-3 text-[11px] text-texto-2">A NF-e de devolução e o ajuste de estoque ficam como tarefa no UpSeller (sem API de NF-e); as tarefas aparecem no histórico do caso.</p>
            {msg && <p className="mt-2 text-xs text-texto">{msg}</p>}
          </Card>
        )}
      </div>
    </div>
  );
}
