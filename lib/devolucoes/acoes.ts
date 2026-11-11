import { supabase } from "@/lib/supabase";
import { chamarShopee } from "@/lib/shopee/chamar";
import { chamarTikTok } from "@/lib/tiktok/client";
import { lojasTikTokAtivas, type LojaTikTok } from "@/lib/tiktok/lojas";
import { configDevolucoes, contaDaLoja } from "@/lib/devolucoes/config";
import { urlAssinada } from "@/lib/devolucoes/midias";
import { ressincronizarShopee, ressincronizarTikTok } from "@/lib/devolucoes/sincronizar";
import { validarAcao, type Acao } from "@/lib/devolucoes/validar";

// B3 — ações na plataforma, atrás da flag `devolucoes_acoes_api` (desligada até o
// Gabriel liberar). Interface única: executar(devolucao, acao, { aprovacaoId, modo }).
// Toda ação grava em devolucao_aprovacoes (o que foi enviado, resposta, erro) e em
// devolucao_eventos. Antes de enviar, consulta o que a plataforma permite agora.
type J = Record<string, unknown>;
export type DevolucaoRef = { id: string; loja_id: string; canal: "shopee" | "tiktok"; plataforma_id: string; pedido_id: string; valor_reembolso_pedido: number | null; comprador_id: string | null };

export async function carregarDevolucao(id: string): Promise<DevolucaoRef | null> {
  const { data } = await supabase.from("devolucoes").select("id, loja_id, canal, plataforma_id, pedido_id, valor_reembolso_pedido, comprador_id").eq("id", id).maybeSingle();
  return (data as DevolucaoRef) ?? null;
}

async function lojaTikTok(lojaId: string): Promise<LojaTikTok> {
  const l = (await lojasTikTokAtivas()).find((x) => x.lojaId === lojaId);
  if (!l) throw new Error("Loja TikTok sem token ativo.");
  return l;
}

// ---- O que é permitido agora (linha 1 da tabela do plano) ----
export async function acoesPermitidas(d: DevolucaoRef): Promise<{ permitidas: string[]; motivos: { id: string | number; texto: string }[]; bruto: J }> {
  if (d.canal === "shopee") {
    const [sol, mot] = await Promise.all([
      chamarShopee<J>({ lojaId: d.loja_id, path: "/api/v2/returns/get_available_solutions", query: { return_sn: d.plataforma_id } }),
      chamarShopee<J>({ lojaId: d.loja_id, path: "/api/v2/returns/get_return_dispute_reason", query: { return_sn: d.plataforma_id } }),
    ]);
    const lista = (sol.response?.available_solution_list ?? sol.response?.available_solution ?? []) as J[];
    const permitidas = lista.map((s) => String(s.solution ?? s)).filter(Boolean);
    const razoes = ((mot.response?.dispute_reason_list ?? mot.response?.dispute_reason ?? []) as J[]).map((r) => ({ id: (r.dispute_reason_id ?? r.reason_id ?? r.id) as string | number, texto: String(r.dispute_reason_name ?? r.reason_text ?? r.name ?? r.id) }));
    return { permitidas, motivos: razoes, bruto: { solucoes: sol, motivos: mot } };
  }
  const loja = await lojaTikTok(d.loja_id);
  const r = await chamarTikTok("/return_refund/202606/review_decision", { accessToken: loja.accessToken, shopCipher: loja.shopCipher, query: { return_id: d.plataforma_id } });
  const dec = ((r.data?.decisions ?? r.data?.available_decisions ?? []) as J[]).map((x) => String(x.decision ?? x));
  const razoes = ((r.data?.reject_reasons ?? r.data?.reasons ?? []) as J[]).map((x) => ({ id: (x.reject_reason ?? x.reason_key ?? x.id) as string, texto: String(x.reject_reason_text ?? x.text ?? x.reject_reason ?? x.id) }));
  return { permitidas: dec, motivos: razoes, bruto: r as J };
}

// ---- Imagens: do nosso Storage para a plataforma ----
async function bufferDaImagem(ref: string): Promise<{ buf: Buffer; tipo: string }> {
  const url = ref.startsWith("http") ? ref : await urlAssinada(ref, 300);
  if (!url) throw new Error(`Imagem não encontrada: ${ref}`);
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Falha ao ler imagem ${ref}: ${r.status}`);
  return { buf: Buffer.from(await r.arrayBuffer()), tipo: r.headers.get("content-type") || "image/jpeg" };
}

async function imagensShopee(lojaId: string, refs: string[]): Promise<string[]> {
  // v2.returns.convert_image: multipart "upload_file" → URL aceita pelos endpoints de prova/disputa
  const urls: string[] = [];
  for (const ref of refs.slice(0, 6)) {
    const { buf, tipo } = await bufferDaImagem(ref);
    const fd = new FormData();
    fd.append("upload_file", new Blob([new Uint8Array(buf)], { type: tipo }), "prova.jpg");
    const r = await chamarShopeeMultipart(lojaId, "/api/v2/returns/convert_image", fd);
    const url = (r.response?.image_url ?? r.response?.url) as string | undefined;
    if (!url) throw new Error(`convert_image: ${r.error || "sem url"} ${r.message || ""}`);
    urls.push(url);
  }
  return urls;
}

async function chamarShopeeMultipart(lojaId: string, path: string, fd: FormData): Promise<{ error?: string; message?: string; response?: J }> {
  // reaproveita a assinatura do chamarShopee: GET com query assinada não serve para multipart,
  // então monta a URL assinada e envia o form.
  const { tokenShopeeDaLoja } = await import("@/lib/shopee/chamar");
  const crypto = await import("crypto");
  const token = await tokenShopeeDaLoja(lojaId);
  const partnerId = process.env.SHOPEE_PARTNER_ID!;
  const partnerKey = process.env.SHOPEE_PARTNER_KEY!;
  const baseUrl = process.env.SHOPEE_API_BASE_URL || "https://partner.shopeemobile.com";
  const timestamp = Math.floor(Date.now() / 1000);
  const sign = crypto.createHmac("sha256", partnerKey).update(`${partnerId}${path}${timestamp}${token.accessToken}${token.shopId}`).digest("hex");
  const url = `${baseUrl}${path}?partner_id=${partnerId}&timestamp=${timestamp}&access_token=${encodeURIComponent(token.accessToken)}&shop_id=${token.shopId}&sign=${sign}`;
  const r = await fetch(url, { method: "POST", body: fd, cache: "no-store" });
  return r.json();
}

async function imagensTikTok(loja: LojaTikTok, refs: string[]): Promise<string[]> {
  const ids: string[] = [];
  for (const ref of refs.slice(0, 6)) {
    const { buf, tipo } = await bufferDaImagem(ref);
    const fd = new FormData();
    fd.append("data", new Blob([new Uint8Array(buf)], { type: tipo }), "prova.jpg");
    fd.append("use_case", "RETURN_AND_REFUND");
    const { assinarTikTok, TIKTOK_BASE } = await import("@/lib/tiktok/client");
    const path = "/product/202309/images/upload";
    const q: Record<string, string> = { app_key: process.env.TIKTOK_APP_KEY!, timestamp: String(Math.floor(Date.now() / 1000)), shop_cipher: loja.shopCipher };
    q.sign = assinarTikTok(path, q, "");
    const r = await fetch(`${TIKTOK_BASE}${path}?${new URLSearchParams(q)}`, { method: "POST", headers: { "x-tts-access-token": loja.accessToken }, body: fd });
    const j = await r.json();
    const id = j?.data?.uri ?? j?.data?.image_id;
    if (!id) throw new Error(`upload imagem TikTok: ${j?.code} ${j?.message}`);
    ids.push(String(id));
  }
  return ids;
}

// ---- Executar ----
export async function executar(d: DevolucaoRef, acao: Acao, ctx: { aprovacaoId?: string; modo: "automatico" | "aprovado"; decididoPor?: string; somaAutomaticaHoje?: number; compradorSuspeito?: boolean }) {
  const contaId = (await contaDaLoja(d.loja_id)) || "";
  const cfg = await configDevolucoes(contaId);
  const v = validarAcao(acao, {
    flagLigada: cfg.acoes_api,
    valorCaso: Number(d.valor_reembolso_pedido || 0),
    somaAutomaticaHoje: ctx.somaAutomaticaHoje ?? 0,
    compradorSuspeito: ctx.compradorSuspeito ?? false,
    limites: cfg.limites,
    modo: ctx.modo,
  });

  // registro da aprovação (cria se não veio uma pedida pelo Telegram/tela)
  let aprovacaoId = ctx.aprovacaoId;
  if (!aprovacaoId) {
    const { data } = await supabase.from("devolucao_aprovacoes").insert({ devolucao_id: d.id, acao, via: "tela", decisao: ctx.modo === "aprovado" ? "aprovada" : null, decidido_por: ctx.decididoPor ?? null, decidido_em: ctx.modo === "aprovado" ? new Date().toISOString() : null }).select("id, idempotency_key").single();
    aprovacaoId = data?.id as string;
  }
  const { data: apr } = await supabase.from("devolucao_aprovacoes").select("idempotency_key").eq("id", aprovacaoId).maybeSingle();
  const idem = (apr?.idempotency_key as string) || crypto.randomUUID();

  if (!v.ok) {
    await supabase.from("devolucao_aprovacoes").update({ erro: v.motivo }).eq("id", aprovacaoId);
    return { ok: false, enviado: false, precisaAprovacao: v.precisaAprovacao, motivo: v.motivo, aprovacaoId };
  }

  let resposta: J = {};
  let erro: string | undefined;
  try {
    if (acao.tipo === "aguardar") {
      resposta = { aguardar: true };
    } else if (d.canal === "shopee") {
      resposta = await executarShopee(d, acao, contaId, cfg.email_disputa);
    } else {
      resposta = await executarTikTok(d, acao, idem);
    }
    const errPlat = String((resposta as J).error || "") || ((resposta as J).code !== undefined && Number((resposta as J).code) !== 0 ? `${(resposta as J).code} ${(resposta as J).message}` : "");
    if (errPlat) erro = errPlat;
  } catch (e) {
    erro = e instanceof Error ? e.message : String(e);
  }

  await supabase.from("devolucao_aprovacoes").update({ executada_em: erro ? null : new Date().toISOString(), resposta_api: resposta, erro: erro ?? null }).eq("id", aprovacaoId);
  await supabase.from("devolucao_eventos").insert({
    devolucao_id: d.id,
    origem: ctx.modo === "automatico" ? "assistente" : "equipe",
    tipo: `acao_${acao.tipo}`,
    descricao: erro ? `Falhou: ${acao.tipo} — ${erro}` : `Enviado: ${acao.tipo}${acao.motivo_plataforma ? ` (motivo ${acao.motivo_plataforma})` : ""}${acao.valor_parcial ? ` R$ ${acao.valor_parcial}` : ""}`,
    dados: { acao, resposta, por: ctx.decididoPor ?? null },
    chave: `acao:${aprovacaoId}`,
  });
  if (!erro && acao.tipo !== "aguardar") {
    try {
      if (d.canal === "shopee") await ressincronizarShopee(d.loja_id, d.plataforma_id);
      else await ressincronizarTikTok("", d.plataforma_id);
    } catch {
      /* o cron de 15 min atualiza */
    }
  }
  return { ok: !erro, enviado: !erro, precisaAprovacao: false, motivo: erro, aprovacaoId, resposta };
}

async function executarShopee(d: DevolucaoRef, acao: Acao, contaId: string, email: string | null): Promise<J> {
  const sn = d.plataforma_id;
  const post = (path: string, body: J) => chamarShopee<J>({ lojaId: d.loja_id, path, method: "POST", body }) as Promise<J>;
  switch (acao.tipo) {
    case "aprovar":
      return post("/api/v2/returns/confirm", { return_sn: sn });
    case "recusar":
    case "disputar": {
      if (!email) throw new Error("A disputa exige um e-mail (Configurações → Devoluções).");
      const imagens = acao.imagens?.length ? await imagensShopee(d.loja_id, acao.imagens) : [];
      return post("/api/v2/returns/dispute", { return_sn: sn, email, dispute_reason: acao.motivo_plataforma, dispute_text_reason: acao.texto ?? "", image: imagens });
    }
    case "oferecer_parcial":
      return post("/api/v2/returns/offer", { return_sn: sn, proposed_solution: "REFUND", proposed_adjusted_refund_amount: acao.valor_parcial });
    case "aceitar_contraproposta":
      return post("/api/v2/returns/accept_offer", { return_sn: sn });
    case "enviar_provas": {
      const imagens = await imagensShopee(d.loja_id, acao.imagens ?? []);
      return post("/api/v2/returns/upload_proof", { return_sn: sn, photo: imagens, text: acao.texto ?? "" });
    }
    case "desistir_disputa":
      return post("/api/v2/returns/cancel_dispute", { return_sn: sn });
    case "rastreio_volta":
      return post("/api/v2/returns/upload_shipping_proof", { return_sn: sn, carrier_name: acao.rastreio?.transportadora, tracking_number: acao.rastreio?.codigo });
    default:
      throw new Error(`Ação não suportada na Shopee: ${acao.tipo}`);
  }
}

async function executarTikTok(d: DevolucaoRef, acao: Acao, idem: string): Promise<J> {
  const loja = await lojaTikTok(d.loja_id);
  const id = encodeURIComponent(d.plataforma_id);
  const post = (path: string, body: J) => chamarTikTok(path, { method: "POST", accessToken: loja.accessToken, shopCipher: loja.shopCipher, query: { idempotency_key: idem }, body }) as Promise<J>;
  switch (acao.tipo) {
    case "aprovar":
      return post(`/return_refund/202309/returns/${id}/approve`, { decision: "APPROVE_RETURN" });
    case "recusar":
    case "disputar": {
      const imagens = acao.imagens?.length ? await imagensTikTok(loja, acao.imagens) : [];
      return post(`/return_refund/202606/returns/${id}/reject`, { decision: "REJECT_REFUND", reject_reason: acao.motivo_plataforma, comment: acao.texto ?? "", images: imagens.map((uri) => ({ uri })) });
    }
    case "oferecer_parcial": {
      const imagens = acao.imagens?.length ? await imagensTikTok(loja, acao.imagens) : [];
      return post(`/return_refund/202606/returns/${id}/reject`, { decision: "OFFER_PARTIAL_REFUND_AFTER_RECEIVING_PKG", reject_reason: acao.motivo_plataforma, comment: acao.texto ?? "", partial_refund_amount: { currency: "BRL", value: String(acao.valor_parcial) }, images: imagens.map((uri) => ({ uri })) });
    }
    case "rastreio_volta":
      return post(`/return_refund/202309/returns/${id}/return_shipping`, { tracking_number: acao.rastreio?.codigo, shipping_provider_name: acao.rastreio?.transportadora });
    case "enviar_provas":
      throw new Error("No TikTok as provas vão junto da recusa/oferta (campo images).");
    default:
      throw new Error(`Ação não suportada no TikTok: ${acao.tipo}`);
  }
}
