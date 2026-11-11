import Anthropic from "@anthropic-ai/sdk";
import { supabase } from "@/lib/supabase";
import { MODELO_IA, ESFORCO_IA } from "@/lib/ia";
import { registrarUsoIA } from "@/lib/uso";
import { urlAssinada } from "@/lib/devolucoes/midias";
import { custoCaminhos, type CustoCaminhos } from "@/lib/devolucoes/custos";
import type { ItemDevolucao } from "@/lib/devolucoes/tipos";

// Assistente de devoluções (B4): lê o caso, o histórico, as fotos/quadros do comprador,
// as nossas provas, o histórico do comprador e o custo de cada caminho, e devolve uma
// sugestão em JSON validado. Modelo: MODELO_IA (lib/ia.ts). Nunca executa nada.
export type Sugestao = {
  decisao: "aprovar" | "recusar" | "oferecer_parcial" | "aceitar_contraproposta" | "disputar" | "aguardar";
  confianca: "alta" | "media" | "baixa";
  motivos: string[];
  motivo_plataforma: string | number | null;
  valor_parcial: number | null;
  mensagem_comprador: string;
  gerada_em: string;
  modelo: string;
  regra_id?: string | null;
  regra_nome?: string | null;
  custos?: CustoCaminhos;
};

const DECISOES = ["aprovar", "recusar", "oferecer_parcial", "aceitar_contraproposta", "disputar", "aguardar"] as const;

type Caso = {
  id: string;
  loja_id: string;
  canal: "shopee" | "tiktok";
  pedido_id: string;
  plataforma_id: string;
  tipo: string;
  etapa: string;
  status_plataforma: string | null;
  motivo_codigo: string | null;
  motivo_texto: string | null;
  texto_comprador: string | null;
  valor_pedido: number | null;
  valor_reembolso_pedido: number | null;
  prazo_resposta: string | null;
  chegou_em: string | null;
  comprador_usuario: string | null;
  comprador_id: string | null;
  itens: ItemDevolucao[] | null;
  disputa_status: string | null;
};

const SYSTEM = `Você é o assistente de devoluções de uma loja brasileira que vende na Shopee e no TikTok Shop.
Sua tarefa: ler o caso e recomendar UMA decisão, explicando em português claro.
Regras da casa:
- Nunca passe contato fora da plataforma. Nunca prometa o que a plataforma não permite.
- Defeito, arrependimento ou item errado com valor baixo: tende a aprovar (custo de disputa > valor).
- "Não recebido" com entrega confirmada e foto do entregador: disputar com o comprovante.
- Na volta veio outro item, ou o peso caiu mais de 20%: disputar com os quadros da abertura e o peso.
- Comprador suspeito (3+ devoluções em 90 dias): não aprovar sozinho; recomende aguardar ou disputar com provas.
- Oferta parcial só quando o produto é barato de reparar ou o defeito é pequeno.
- Se faltar prova decisiva (foto ilegível, sem inspeção ainda), responda "aguardar" e diga o que falta.
- A mensagem ao comprador: curta, educada, sem culpa, sem promessas de prazo.
Responda SOMENTE com um JSON com os campos:
{"decisao":"aprovar|recusar|oferecer_parcial|aceitar_contraproposta|disputar|aguardar","confianca":"alta|media|baixa","motivos":["..."],"motivo_plataforma":null,"valor_parcial":null,"mensagem_comprador":"..."}`;

function moeda(v: number | null | undefined) {
  return `R$ ${Number(v || 0).toFixed(2).replace(".", ",")}`;
}

async function imagensDoCaso(devolucaoId: string, max = 6): Promise<{ url: string; legenda: string }[]> {
  const { data } = await supabase
    .from("devolucao_midias")
    .select("origem, tipo, storage_path, url_plataforma, legenda, segundo_no_video")
    .eq("devolucao_id", devolucaoId)
    .in("tipo", ["foto", "quadro"])
    .order("criado_em", { ascending: true })
    .limit(max * 2);
  const saida: { url: string; legenda: string }[] = [];
  for (const m of data || []) {
    const url = m.storage_path ? await urlAssinada(m.storage_path, 600) : m.url_plataforma;
    if (!url) continue;
    const quem = m.origem === "comprador" ? "foto do comprador" : m.tipo === "quadro" ? `quadro do nosso vídeo de abertura (${m.segundo_no_video ?? "?"} s)` : "nossa foto";
    saida.push({ url, legenda: `${quem}${m.legenda ? `: ${m.legenda}` : ""}` });
    if (saida.length >= max) break;
  }
  return saida;
}

export async function montarContexto(caso: Caso) {
  const [{ data: eventos }, { data: insp }, { data: risco }, custos, imagens] = await Promise.all([
    supabase.from("devolucao_eventos").select("quando, origem, tipo, descricao").eq("devolucao_id", caso.id).order("quando", { ascending: true }).limit(30),
    supabase.from("devolucao_inspecoes").select("peso_envio_kg, peso_chegada_kg, estado, destino, observacao, itens").eq("devolucao_id", caso.id).order("criado_em", { ascending: false }).limit(1).maybeSingle(),
    caso.comprador_id ? supabase.from("compradores_risco").select("devolucoes_90d, suspeito, motivo").eq("canal", caso.canal).eq("comprador_id", caso.comprador_id).maybeSingle() : Promise.resolve({ data: null }),
    custoCaminhos(caso),
    imagensDoCaso(caso.id),
  ]);
  const linhas: string[] = [
    `Canal: ${caso.canal === "shopee" ? "Shopee" : "TikTok Shop"} · Caso ${caso.plataforma_id} · Pedido ${caso.pedido_id}`,
    `Tipo: ${caso.tipo} · Etapa: ${caso.etapa} · Status na plataforma: ${caso.status_plataforma ?? "-"}`,
    `Motivo: ${caso.motivo_codigo ?? "-"}${caso.motivo_texto && caso.motivo_texto !== caso.motivo_codigo ? ` (${caso.motivo_texto})` : ""}`,
    `Texto do comprador: ${caso.texto_comprador?.trim() || "(sem texto)"}`,
    `Valor do pedido: ${moeda(caso.valor_pedido)} · Reembolso pedido: ${moeda(caso.valor_reembolso_pedido)}`,
    `Prazo de resposta: ${caso.prazo_resposta ? new Date(caso.prazo_resposta).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "-"}`,
    `Pacote chegou ao armazém: ${caso.chegou_em ? "sim" : "não"}`,
    `Itens: ${(caso.itens || []).map((i) => `${i.quantidade}× ${i.nome ?? "?"} [${i.variacao ?? i.sku ?? "-"}] ${moeda(i.valor)}`).join("; ") || "-"}`,
    `Comprador: ${caso.comprador_usuario ?? caso.comprador_id ?? "-"} · devoluções em 90 dias: ${risco?.devolucoes_90d ?? 0}${risco?.suspeito ? " · SUSPEITO" : ""}`,
    `Custos: repasse em risco ${moeda(custos.repasse_em_risco)} · afiliado estornado ${moeda(custos.afiliado_estornado)} · frete do vendedor ${moeda(custos.frete_vendedor)} · custo do produto ${moeda(custos.custo_produto)}`,
    `Se aprovar e o produto voltar: perde ${moeda(custos.aprovar_total)} · se aprovar sem devolução: perde ${moeda(custos.aprovar_sem_devolucao)} · se recusar e ganhar: perde ${moeda(0)}`,
  ];
  if (insp) {
    linhas.push(`Inspeção: peso envio ${insp.peso_envio_kg ?? "?"} kg · chegada ${insp.peso_chegada_kg ?? "?"} kg · estado ${insp.estado ?? "?"} · destino ${insp.destino ?? "?"}${insp.observacao ? ` · obs: ${insp.observacao}` : ""}`);
  } else {
    linhas.push("Inspeção: ainda não feita.");
  }
  if (eventos?.length) linhas.push("Histórico:\n" + eventos.map((e) => `- ${new Date(e.quando).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} [${e.origem}] ${e.descricao ?? e.tipo}`).join("\n"));
  return { texto: linhas.join("\n"), imagens, custos, risco: risco ?? null };
}

function validarSugestao(raw: unknown): Omit<Sugestao, "gerada_em" | "modelo"> | null {
  if (!raw || typeof raw !== "object") return null;
  const j = raw as Record<string, unknown>;
  const decisao = String(j.decisao || "");
  if (!(DECISOES as readonly string[]).includes(decisao)) return null;
  const confianca = ["alta", "media", "baixa"].includes(String(j.confianca)) ? (String(j.confianca) as Sugestao["confianca"]) : "baixa";
  const motivos = Array.isArray(j.motivos) ? j.motivos.map(String).slice(0, 6) : [];
  const vp = j.valor_parcial === null || j.valor_parcial === undefined ? null : Number(j.valor_parcial);
  return {
    decisao: decisao as Sugestao["decisao"],
    confianca,
    motivos,
    motivo_plataforma: j.motivo_plataforma === undefined ? null : (j.motivo_plataforma as string | number | null),
    valor_parcial: Number.isFinite(vp as number) ? vp : null,
    mensagem_comprador: String(j.mensagem_comprador || "").slice(0, 800),
  };
}

export async function sugerir(caso: Caso): Promise<Sugestao> {
  const ctx = await montarContexto(caso);
  const client = new Anthropic();
  const conteudo: Anthropic.Messages.ContentBlockParam[] = [{ type: "text", text: ctx.texto }];
  for (const img of ctx.imagens) {
    conteudo.push({ type: "text", text: `Imagem: ${img.legenda}` });
    conteudo.push({ type: "image", source: { type: "url", url: img.url } });
  }
  const resposta = await client.messages.create({
    model: MODELO_IA,
    max_tokens: 2048,
    output_config: { effort: ESFORCO_IA },
    system: SYSTEM,
    messages: [{ role: "user", content: conteudo }],
  });
  await registrarUsoIA({ lojaId: caso.loja_id, tipo: "devolucao", modelo: MODELO_IA, marketplace: caso.canal === "tiktok" ? "tiktok_shop" : "shopee", usage: resposta.usage });
  const texto = resposta.content.find((b) => b.type === "text");
  const bruto = texto && "text" in texto ? texto.text : "";
  let parsed: unknown = null;
  try {
    const i = bruto.indexOf("{");
    const f = bruto.lastIndexOf("}");
    parsed = JSON.parse(bruto.slice(i, f + 1));
  } catch {
    parsed = null;
  }
  const v = validarSugestao(parsed) ?? { decisao: "aguardar" as const, confianca: "baixa" as const, motivos: ["O assistente não devolveu uma resposta válida; revisar manualmente."], motivo_plataforma: null, valor_parcial: null, mensagem_comprador: "" };
  const sug: Sugestao = { ...v, gerada_em: new Date().toISOString(), modelo: MODELO_IA, custos: ctx.custos };
  await supabase.from("devolucoes").update({ sugestao: sug }).eq("id", caso.id);
  await supabase.from("devolucao_eventos").upsert(
    { devolucao_id: caso.id, origem: "assistente", tipo: "sugestao", descricao: `Sugestão: ${sug.decisao} (${sug.confianca}) — ${sug.motivos[0] ?? ""}`, dados: { decisao: sug.decisao, confianca: sug.confianca }, chave: `sugestao:${sug.gerada_em.slice(0, 13)}` },
    { onConflict: "devolucao_id,chave", ignoreDuplicates: true }
  );
  return sug;
}

export type { Caso as CasoAssistente };
