import crypto from "crypto";
import Anthropic from "@anthropic-ai/sdk";
import { supabase } from "@/lib/supabase";
import { enviarTelegram } from "@/lib/telegram";

const BASE_URL_PADRAO = "https://partner.shopeemobile.com";

const SYSTEM = `Você é o atendimento da NGK Store no chat da Shopee, em português do Brasil. Responda como um vendedor humano, experiente, simpático e RESOLUTIVO.

Você recebe: dados do produto, EXEMPLOS REAIS de como a NGK Store já respondeu antes, e a CONVERSA ATUAL COMPLETA. Leia tudo e resolva a dúvida do cliente.

O cliente costuma dividir a dúvida em várias mensagens — leia a conversa INTEIRA e junte o contexto antes de responder.

REGRA PRINCIPAL: você DEVE RESPONDER a grande maioria das dúvidas, INCLUSIVE sobre envio, prazo de entrega, pagamento, devolução e reembolso. NÃO escale essas dúvidas — resolva usando as orientações abaixo e o jeito que a loja já respondeu nos exemplos. Aprenda o tom e as orientações dos exemplos reais.

Orientações padrão da NGK Store (use e adapte ao caso):
- Prazo / envio: o pedido é despachado dentro do prazo de manuseio do anúncio (geralmente poucos dias úteis); o prazo de ENTREGA aparece na tela de pagamento e no acompanhamento do pedido no app da Shopee. Tranquilize o cliente e oriente a acompanhar por lá.
- Pagamento: dúvidas/problemas de pagamento são tratados pelo próprio app da Shopee (Eu > Central de Ajuda / suporte). Oriente com gentileza.
- Devolução / Reembolso: o cliente solicita direto pelo app — Eu > Minhas Compras > [o pedido] > "Devolução/Reembolso" — e a NGK Store apoia o processo. Demonstre empatia e explique esse passo a passo de forma acolhedora.
- Produto: responda pela DESCRIÇÃO e pelos exemplos. Se a informação específica não existir, oriente o cliente a conferir as imagens/descrição do anúncio.

Categorias: "produto" | "envio_prazo" | "pagamento" | "devolucao_reembolso" | "defeito" | "outro".

QUANDO escalar (precisa_humano=true): SOMENTE em casos que exijam uma decisão manual da loja que as orientações não cobrem (ex.: cliente pede que a loja pague o frete da devolução, negociação de valor/desconto, exceção específica, ou cobrança de algo fora do padrão), ou quando realmente não houver como responder. Na dúvida entre responder e escalar, PREFIRA RESPONDER com a orientação padrão (confianca="alta").

TOM: caloroso, humano, gentil e completo o suficiente pra resolver, sem enrolação. Cumprimente naturalmente, dê a informação CONCRETA, e ofereça ajuda adicional no fim. No máximo 1 emoji. Nunca invente dados nem prometa o que não pode cumprir.

Responda APENAS com um JSON válido, sem nenhum texto fora dele, no formato:
{"categoria":"produto|envio_prazo|pagamento|devolucao_reembolso|defeito|outro","confianca":"alta|baixa","precisa_humano":true|false,"resposta":"..."}`;

type Token = { accessToken: string; shopId: string };

async function obterToken(lojaId: string): Promise<Token> {
  const { data: token } = await supabase
    .from("marketplace_tokens")
    .select("access_token, shop_id")
    .eq("marketplace", "shopee")
    .eq("status", "ativo")
    .eq("loja_id", lojaId)
    .limit(1)
    .single();
  if (!token?.access_token || !token?.shop_id) {
    throw new Error("Loja Shopee sem token ativo.");
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
    model: "claude-opus-4-8",
    max_tokens: 700,
    system: SYSTEM,
    messages: [{ role: "user", content: contexto }],
  });
  const bloco = r.content.find((b) => b.type === "text");
  const txt = bloco && "text" in bloco ? bloco.text.trim() : "";
  // Extrai o objeto JSON mesmo que venha texto em volta.
  const inicio = txt.indexOf("{");
  const fim = txt.lastIndexOf("}");
  if (inicio === -1 || fim === -1) return null;
  try {
    return JSON.parse(txt.slice(inicio, fim + 1)) as Decisao;
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
  lojaId,
  limite = 10,
  enviar = false,
  autonomo = false,
}: {
  lojaId: string;
  limite?: number;
  enviar?: boolean;
  autonomo?: boolean;
}): Promise<ResultadoChat> {
  const { data: conversas } = await supabase
    .from("chat_conversas")
    .select(
      "conversation_id, to_id, to_name, item_id, ultima_mensagem, latest_message_id, ultimo_tratado_msg_id"
    )
    .eq("loja_id", lojaId)
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

  const token = await obterToken(lojaId);
  const client = new Anthropic();

  // Aprendizado: exemplos REAIS de como a loja já respondeu (qualquer produto),
  // para o robô seguir o mesmo tom e as mesmas orientações (envio, devolução…).
  const { data: exemplosRaw } = await supabase
    .from("chat_mensagens")
    .select("texto")
    .eq("loja_id", lojaId)
    .eq("de_loja", true)
    .not("texto", "is", null)
    .neq("texto", "")
    .order("created_timestamp", { ascending: false })
    .limit(80);

  const vistos = new Set<string>();
  const exemplosLoja: string[] = [];
  for (const m of exemplosRaw || []) {
    const t = (m.texto || "").trim();
    if (t.length < 20 || vistos.has(t)) continue; // pula saudações curtas/repetidas
    vistos.add(t);
    exemplosLoja.push(t);
    if (exemplosLoja.length >= 30) break;
  }
  const exemplosTxt =
    exemplosLoja.length > 0
      ? exemplosLoja.map((t) => `- ${t}`).join("\n")
      : "(sem exemplos)";

  let enviados = 0;
  let escalados = 0;
  const propostas: PropostaChat[] = [];

  for (const c of pendentes) {
    // item_id da conversa; se não houver, infere pelo pedido recente do cliente.
    let itemId: number | null = c.item_id ?? null;
    if (!itemId && c.to_name) {
      const { data: ped } = await supabase
        .from("pedidos")
        .select("dados_pedido")
        .eq("marketplace", "shopee")
        .eq("loja_id", lojaId)
        .eq("cliente_nome", c.to_name)
        .order("data_pedido", { ascending: false })
        .limit(1)
        .maybeSingle();
      const itens = (
        ped?.dados_pedido as { item_list?: { item_id?: number }[] } | null
      )?.item_list;
      if (Array.isArray(itens) && itens[0]?.item_id) {
        itemId = Number(itens[0].item_id);
      }
    }

    // Produto da conversa
    let produtoTxt = "Produto não identificado.";
    let nomeProduto = "Produto";
    if (itemId) {
      const { data: prod } = await supabase
        .from("produtos")
        .select("nome, descricao, preco, estoque")
        .eq("item_id", itemId)
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
    if (itemId) {
      const { data: msgs } = await supabase
        .from("chat_mensagens")
        .select("de_loja, texto, created_timestamp")
        .eq("loja_id", lojaId)
        .eq("item_id", itemId)
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
        `=== COMO A NGK STORE JÁ RESPONDEU (exemplos reais — siga o mesmo tom e orientações) ===\n${exemplosTxt}\n\n` +
        `=== RESPOSTAS ANTERIORES DA LOJA NESTE PRODUTO ===\n${historicoTxt}\n\n` +
        `=== CONVERSA ATUAL COM ESTE CLIENTE (do início ao fim) ===\n${conversaTxt}\n\n` +
        `Responda à(s) última(s) mensagem(ns) do cliente, considerando TODA a conversa acima.`;

      decisao = await decidir(client, contexto);
      escalar =
        !decisao ||
        decisao.precisa_humano === true ||
        decisao.confianca === "baixa";
      resposta = decisao?.resposta || "";
      categoria = decisao?.categoria || "outro";
      confianca = decisao?.confianca || "baixa";
    }

    // Modo 100% autônomo: responde TUDO (nunca escala). Se a IA não gerou
    // texto (ex.: cliente só mandou imagem), envia uma mensagem gentil
    // pedindo mais detalhes, em vez de deixar pra você.
    if (autonomo && !resposta.trim()) {
      resposta =
        "Oi! 😊 Recebi sua mensagem. Pode me contar com mais detalhes como posso te ajudar?";
    }
    const deveResponder =
      resposta.trim().length > 0 && (autonomo || !escalar);

    propostas.push({
      conversation_id: c.conversation_id,
      cliente: c.to_name,
      pergunta: pergunta || "(sem texto — anexo/imagem)",
      categoria,
      confianca,
      acao: deveResponder ? "responder" : "escalar",
      resposta,
    });

    if (!enviar) continue; // modo revisão: não envia nem marca

    try {
      if (!deveResponder) {
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
