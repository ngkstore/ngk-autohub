import crypto from "crypto";
import Anthropic from "@anthropic-ai/sdk";
import { supabase } from "@/lib/supabase";
import { enviarTelegram } from "@/lib/telegram";

const BASE_URL_PADRAO = "https://partner.shopeemobile.com";

const SYSTEM = `Você é o atendimento da NGK Store no chat da Shopee, em português do Brasil.
Receba os dados do produto, o histórico de respostas anteriores da loja e a CONVERSA ATUAL COMPLETA, e gere uma resposta curta, acolhedora e correta.

IMPORTANTE: o cliente costuma dividir a dúvida em várias mensagens separadas. Leia a conversa INTEIRA antes de responder e junte o contexto — não responda olhando só a última mensagem isolada. Só escale para humano se, mesmo com toda a conversa, faltar informação para responder com segurança.

Classifique a mensagem do cliente em uma categoria e responda conforme as regras:
- "produto": dúvida sobre o produto. Responda usando a DESCRIÇÃO e as RESPOSTAS ANTERIORES da loja. Se a informação NÃO estiver na descrição nem no histórico, NÃO invente: confianca="baixa" e precisa_humano=true.
- "prazo": dúvida sobre prazo de envio/entrega. Responda de forma geral e tranquilizadora (o envio segue o prazo informado no anúncio); confianca="alta".
- "logistica_pagamento": problema de entrega, rastreio, pagamento. Oriente o cliente a falar com o suporte da Shopee pelo app; confianca="alta".
- "defeito": defeito, produto errado, reclamação ou pedido de reembolso. SEMPRE precisa_humano=true (não resolva sozinho); na resposta, demonstre empatia e diga que vai verificar.
- "outro": qualquer outra coisa; se não tiver certeza, precisa_humano=true.

Tom: humano, gentil, direto, 1 emoji no máximo. Não prometa o que não pode cumprir.

Responda APENAS com um JSON válido, sem texto fora dele, no formato:
{"categoria":"produto|prazo|logistica_pagamento|defeito|outro","confianca":"alta|baixa","precisa_humano":true|false,"resposta":"..."}`;

type Token = { accessToken: string; shopId: string };

async function obterToken(): Promise<Token> {
  const { data: token } = await supabase
    .from("marketplace_tokens")
    .select("access_token, shop_id")
    .eq("marketplace", "shopee")
    .eq("status", "ativo")
    .limit(1)
    .single();
  if (!token?.access_token || !token?.shop_id) {
    throw new Error("Nenhuma loja Shopee com token ativo.");
  }
  return { accessToken: token.access_token, shopId: String(token.shop_id) };
}

async function enviarMensagem(token: Token, toId: string, texto: string) {
  const partnerId = process.env.SHOPEE_PARTNER_ID!;
  const partnerKey = process.env.SHOPEE_PARTNER_KEY!;
  const baseUrl = process.env.SHOPEE_API_BASE_URL || BASE_URL_PADRAO;
  const path = "/api/v2/sellerchat/send_message";
  const timestamp = Math.floor(Date.now() / 1000);

  const sign = crypto
    .createHmac("sha256", partnerKey)
    .update(`${partnerId}${path}${timestamp}${token.accessToken}${token.shopId}`)
    .digest("hex");

  const url =
    `${baseUrl}${path}` +
    `?partner_id=${partnerId}` +
    `&timestamp=${timestamp}` +
    `&access_token=${encodeURIComponent(token.accessToken)}` +
    `&shop_id=${token.shopId}` +
    `&sign=${sign}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      to_id: Number(toId),
      message_type: "text",
      content: { text: texto },
    }),
  });

  const data = await response.json();
  if (!response.ok || data.error) {
    throw new Error(`Erro send_message: ${data?.error || "-"} | ${data?.message || "-"}`);
  }
  return data;
}

type Decisao = {
  categoria: string;
  confianca: string;
  precisa_humano: boolean;
  resposta: string;
};

async function decidir(
  client: Anthropic,
  contexto: string
): Promise<Decisao | null> {
  const r = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 500,
    system: SYSTEM,
    messages: [{ role: "user", content: contexto }],
  });
  const bloco = r.content.find((b) => b.type === "text");
  const txt = bloco && "text" in bloco ? bloco.text.trim() : "";
  try {
    const limpo = txt.replace(/^```json?/i, "").replace(/```$/, "").trim();
    return JSON.parse(limpo) as Decisao;
  } catch {
    return null;
  }
}

export type PropostaChat = {
  conversation_id: string;
  cliente: string | null;
  pergunta: string;
  categoria: string;
  confianca: string;
  acao: "responder" | "escalar";
  resposta: string;
};

export type ResultadoChat = {
  processados: number;
  enviados: number;
  escalados: number;
  propostas: PropostaChat[];
  erro?: string;
};

// Processa conversas pendentes (cliente foi o último a falar). Se enviar=false,
// apenas gera as respostas propostas (sem enviar nem marcar) — modo de revisão.
export async function responderChatsLote({
  limite = 10,
  enviar = false,
}: { limite?: number; enviar?: boolean } = {}): Promise<ResultadoChat> {
  const { data: conversas } = await supabase
    .from("chat_conversas")
    .select(
      "conversation_id, to_id, to_name, item_id, ultima_mensagem, latest_message_id, ultimo_tratado_msg_id"
    )
    .eq("precisa_resposta", true)
    .order("ultima_mensagem_ts", { ascending: false })
    .limit(limite * 3);

  const pendentes = (conversas || [])
    .filter(
      (c) =>
        String(c.ultimo_tratado_msg_id ?? "") !==
        String(c.latest_message_id ?? "")
    )
    .slice(0, limite);

  if (pendentes.length === 0) {
    return { processados: 0, enviados: 0, escalados: 0, propostas: [] };
  }

  const token = await obterToken();
  const client = new Anthropic();

  let enviados = 0;
  let escalados = 0;
  const propostas: PropostaChat[] = [];

  for (const c of pendentes) {
    // Produto da conversa
    let produtoTxt = "Produto não identificado.";
    let nomeProduto = "Produto";
    if (c.item_id) {
      const { data: prod } = await supabase
        .from("produtos")
        .select("nome, descricao, preco, estoque")
        .eq("item_id", c.item_id)
        .maybeSingle();
      if (prod) {
        nomeProduto = prod.nome || "Produto";
        produtoTxt =
          `Nome: ${prod.nome}\nPreço: ${prod.preco}\nEstoque: ${prod.estoque}\n` +
          `Descrição: ${(prod.descricao || "(sem descrição)").slice(0, 1500)}`;
      }
    }

    // Respostas anteriores da loja para este produto
    let historicoTxt = "(sem histórico)";
    if (c.item_id) {
      const { data: msgs } = await supabase
        .from("chat_mensagens")
        .select("de_loja, texto, created_timestamp")
        .eq("item_id", c.item_id)
        .not("texto", "is", null)
        .order("created_timestamp", { ascending: false })
        .limit(16);
      if (msgs && msgs.length > 0) {
        historicoTxt = msgs
          .reverse()
          .filter((m) => m.texto)
          .map((m) => `${m.de_loja ? "Loja" : "Cliente"}: ${m.texto}`)
          .join("\n");
      }
    }

    // Conversa COMPLETA (do início ao fim) — o cliente costuma quebrar a
    // dúvida em várias mensagens; o robô precisa de todo o contexto.
    const { data: thread } = await supabase
      .from("chat_mensagens")
      .select("de_loja, texto, created_timestamp")
      .eq("conversation_id", c.conversation_id)
      .not("texto", "is", null)
      .neq("texto", "")
      .order("created_timestamp", { ascending: false })
      .limit(40);

    const mensagensOrdenadas = (thread || []).slice().reverse();
    const conversaTxt =
      mensagensOrdenadas.length > 0
        ? mensagensOrdenadas
            .map((m) => `${m.de_loja ? "Loja" : "Cliente"}: ${m.texto}`)
            .join("\n")
        : "(sem mensagens de texto)";

    // Pergunta = última mensagem do cliente (para exibição/notificação).
    const ultimaDoCliente = [...mensagensOrdenadas]
      .reverse()
      .find((m) => !m.de_loja);
    const pergunta = ultimaDoCliente?.texto || c.ultima_mensagem || "";

    let decisao = null;
    let escalar: boolean;
    let categoria = "outro";
    let confianca = "baixa";
    let resposta = "";

    const temTextoCliente = mensagensOrdenadas.some((m) => !m.de_loja);

    if (!temTextoCliente) {
      // Cliente mandou só imagem/anexo (sem texto) -> escala para humano.
      escalar = true;
      categoria = "anexo";
    } else {
      const contexto =
        `=== PRODUTO ===\n${produtoTxt}\n\n` +
        `=== RESPOSTAS ANTERIORES DA LOJA NESTE PRODUTO (aprenda com elas) ===\n${historicoTxt}\n\n` +
        `=== CONVERSA ATUAL COM ESTE CLIENTE (do início ao fim) ===\n${conversaTxt}\n\n` +
        `Responda à(s) última(s) mensagem(ns) do cliente, considerando TODA a conversa acima.`;

      decisao = await decidir(client, contexto);
      escalar =
        !decisao ||
        decisao.precisa_humano === true ||
        decisao.confianca === "baixa" ||
        decisao.categoria === "defeito";
      resposta = decisao?.resposta || "";
      categoria = decisao?.categoria || "outro";
      confianca = decisao?.confianca || "baixa";
    }

    propostas.push({
      conversation_id: c.conversation_id,
      cliente: c.to_name,
      pergunta: pergunta || "(sem texto — anexo/imagem)",
      categoria,
      confianca,
      acao: escalar ? "escalar" : "responder",
      resposta,
    });

    if (!enviar) continue; // modo revisão: não envia nem marca

    try {
      if (escalar) {
        await supabase
          .from("chat_conversas")
          .update({
            ultimo_tratado_msg_id: c.latest_message_id,
            escalada: true,
            motivo_escala: `${categoria} / confiança ${confianca}`,
            categoria,
            confianca,
            resposta_ia: resposta,
          })
          .eq("conversation_id", c.conversation_id);

        // Notifica você no Telegram. Se houver sugestão, oferece aprovar com 1 toque.
        const botoes = resposta
          ? [
              [
                {
                  text: "✅ Aprovar e enviar a sugestão",
                  callback_data: `ap:${c.conversation_id}`,
                },
              ],
              [
                {
                  text: "✏️ Eu respondo",
                  callback_data: `rj:${c.conversation_id}`,
                },
              ],
            ]
          : undefined;

        await enviarTelegram(
          `🔔 Chat para você responder\n\n` +
            `Cliente: ${c.to_name || "-"}\n` +
            `Produto: ${nomeProduto}\n` +
            `Assunto: ${categoria} (confiança ${confianca})\n\n` +
            `Cliente disse:\n"${pergunta || "(enviou um anexo/imagem)"}"\n\n` +
            `Sugestão da IA:\n${resposta || "(sem sugestão)"}`,
          botoes
        );

        escalados++;
      } else {
        await enviarMensagem(token, String(c.to_id), resposta);
        await supabase
          .from("chat_conversas")
          .update({
            ultimo_tratado_msg_id: c.latest_message_id,
            precisa_resposta: false,
            ultimo_remetente: "loja",
            escalada: false,
            categoria,
            confianca,
            resposta_ia: resposta,
            respondida_em: new Date().toISOString(),
          })
          .eq("conversation_id", c.conversation_id);
        enviados++;
      }
    } catch {
      // falha no envio: deixa pendente para a próxima rodada
    }
  }

  return {
    processados: pendentes.length,
    enviados,
    escalados,
    propostas,
  };
}
