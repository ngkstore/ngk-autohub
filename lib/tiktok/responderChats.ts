import Anthropic from "@anthropic-ai/sdk";
import { supabase } from "@/lib/supabase";
import { chamarTikTok } from "@/lib/tiktok/client";
import { garantirTokenTikTok, type LinhaTokenTikTok } from "@/lib/tiktok/token";
import { enviarTelegram } from "@/lib/telegram";
import { registrarUsoIA } from "@/lib/uso";

const BASE_PATH = "/customer_service/202309";

// Contato fora da plataforma — mesma proteção do robô Shopee.
const RE_CONTATO_EXTERNO =
  /whats|wpp|\bzap\b|zapzap|telegram|instagram|\binsta\b|facebook|messenger|e-?mail|https?:\/\/|www\.|\.com\b|\.br\b|\(?\d{2}\)?\s?9?\s?\d{4}[-.\s]?\d{4}|fora da (plataforma|shopee|tiktok)|por fora|(meu|seu|teu) n[uú]mero|n[uú]mero (de|do) (telefone|celular|contato|whats)|me liga|te ligo|ligar pra/i;

function contemContatoExterno(texto: string | null | undefined) {
  return RE_CONTATO_EXTERNO.test(texto || "");
}

const AVISO_CONTATO =
  "\n\nATENÇÃO: sua resposta anterior citava contato fora da plataforma (WhatsApp, telefone, e-mail, rede social ou link). Isso vai prejudicar a loja. Reescreva resolvendo tudo aqui, pelo chat do TikTok Shop, sem pedir nem oferecer NENHUM contato externo.";

function montarSystem(nomeLoja: string) {
  return `Você é o atendimento da ${nomeLoja} no chat do TikTok Shop, em português do Brasil. Fale como um vendedor humano de verdade: simpático, direto e prestativo.

Você recebe a conversa atual completa com o cliente. O cliente pode dividir a dúvida em várias mensagens — leia tudo e responda a última dúvida dele.

COMO ESCREVER (muito importante):
- Curto e natural: normalmente 1 a 3 frases. Uma pessoa real não escreve textão.
- Sem drama e sem CAIXA ALTA para enfatizar. Nunca fale de processos internos da loja.
- No máximo 1 emoji. Não repita o nome do cliente, não encha de exclamações.
- Vá direto na informação que resolve, com gentileza. Sem enrolação e sem prometer o que não pode cumprir.

O QUE VOCÊ RESOLVE (responda, não escale):
- Produto: responda com base no que o cliente perguntou.
- Envio/prazo: o pedido é despachado dentro do prazo; o prazo de ENTREGA aparece no acompanhamento do pedido no app do TikTok Shop.
- Devolução/Reembolso: o cliente abre pelo app do TikTok Shop. Seja acolhedor e explique o passo a passo de forma curta.
- Pagamento: tratado pelo próprio app do TikTok Shop.

DISPONIBILIDADE / CORES / VARIAÇÕES — regra crítica:
- Se perguntarem sobre uma cor/variação, diga que as opções disponíveis aparecem nas variações do anúncio na hora de comprar.
- Nunca invente preço, cor, medida ou prazo que não esteja nos dados.

CONTATO FORA DO TIKTOK SHOP — regra crítica:
- NUNCA peça nem ofereça WhatsApp, telefone, celular, e-mail, Instagram, Telegram, link ou qualquer contato fora do TikTok Shop.
- Todo o atendimento acontece aqui, pelo chat. Se o cliente pedir contato externo, responda com gentileza que a loja atende só por aqui e resolva a dúvida por aqui.

QUANDO precisa_humano=true: só quando o caso exige decisão manual que as orientações não cobrem (negociação, exceção fora do padrão, pedido com problema grave). MESMO ASSIM, o campo "resposta" deve ser uma mensagem curta e tranquila pro cliente: "Deixa eu confirmar isso certinho pra te retornar, tá? 🙏"

Categorias: "produto" | "envio_prazo" | "pagamento" | "devolucao_reembolso" | "defeito" | "outro".

Responda APENAS com um JSON válido, sem nenhum texto fora dele:
{"categoria":"produto|envio_prazo|pagamento|devolucao_reembolso|defeito|outro","confianca":"alta|baixa","precisa_humano":true|false,"resposta":"..."}`;
}

// ── API helpers ──────────────────────────────────────────────────────────────

type TokenInfo = { accessToken: string; shopCipher: string };

async function obterTokenTikTok(lojaId: string): Promise<TokenInfo> {
  const { data } = await supabase
    .from("marketplace_tokens")
    .select("id, loja_id, access_token, refresh_token, expire_in, status, shop_cipher, shop_id")
    .eq("marketplace", "tiktok_shop")
    .eq("loja_id", lojaId)
    .in("status", ["ativo", "expirado"])
    .order("atualizado_em", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data?.access_token) throw new Error("Loja TikTok sem token.");
  const r = await garantirTokenTikTok(data as unknown as LinhaTokenTikTok, 3600);
  if (r.erro) throw new Error(`token: ${r.erro}`);
  return { accessToken: r.accessToken!, shopCipher: (data.shop_cipher as string) || "" };
}

async function listarConversas(t: TokenInfo, pageSize = 50) {
  return chamarTikTok(`${BASE_PATH}/conversations`, {
    method: "GET",
    accessToken: t.accessToken,
    shopCipher: t.shopCipher,
    query: { page_size: String(Math.min(pageSize, 20)) },
  });
}

async function listarMensagens(t: TokenInfo, conversationId: string, pageSize = 20) {
  return chamarTikTok(`${BASE_PATH}/conversations/${conversationId}/messages`, {
    method: "GET",
    accessToken: t.accessToken,
    shopCipher: t.shopCipher,
    query: { page_size: String(pageSize) },
  });
}

async function enviarMensagem(t: TokenInfo, conversationId: string, texto: string) {
  return chamarTikTok(`${BASE_PATH}/conversations/${conversationId}/messages`, {
    method: "POST",
    accessToken: t.accessToken,
    shopCipher: t.shopCipher,
    body: { type: "TEXT", content: JSON.stringify({ content: texto }) },
  });
}

// Envio avulso (botão "Aprovar" do Telegram): resolve o token da loja e envia.
export async function enviarMensagemTikTokPorLoja(
  lojaId: string,
  conversationId: string,
  texto: string
) {
  const t = await obterTokenTikTok(lojaId);
  const resp = await enviarMensagem(t, conversationId, texto);
  if (resp.code !== 0) throw new Error(`TikTok send: ${resp.message}`);
}

// ── Sincronizar conversas → chat_conversas ───────────────────────────────────

export async function sincronizarChatsTikTok(lojaId: string) {
  const t = await obterTokenTikTok(lojaId);
  const resp = await listarConversas(t, 20);
  if (resp.code !== 0) throw new Error(`TikTok conversations: ${resp.message}`);

  const convs: Array<{
    id: string;
    latest_message: { sender: { role: string }; create_time: number; id: string; content: string };
    unread_count: number;
    can_send_message: boolean;
    participants: Array<{ role: string; nickname: string; im_user_id: string }>;
  }> = resp.data?.conversations || [];

  let sincronizados = 0;
  for (const c of convs) {
    const lm = c.latest_message;
    const ultimoRemetente = lm?.sender?.role === "BUYER" ? "cliente" : "loja";
    const buyer = c.participants?.find((p) => p.role === "BUYER");

    await supabase.from("chat_conversas").upsert(
      {
        marketplace: "tiktok_shop",
        conversation_id: c.id,
        loja_id: lojaId,
        to_id: buyer?.im_user_id || "",
        to_name: buyer?.nickname || "",
        ultimo_remetente: ultimoRemetente,
        // Decide por QUEM falou por último (não por unread: abrir a conversa no
        // Seller Center zera o unread e deixava o cliente sem resposta).
        precisa_resposta: ultimoRemetente === "cliente" && c.can_send_message,
        unread_count: c.unread_count,
        ultima_mensagem_ts: lm?.create_time ? lm.create_time * 1000 * 1_000_000 : null,
        latest_message_id: lm?.id || null,
        atualizado_em: new Date().toISOString(),
      },
      { onConflict: "marketplace,conversation_id", ignoreDuplicates: false }
    );
    sincronizados++;
  }

  return { conversas: sincronizados };
}

// ── Responder conversas pendentes ────────────────────────────────────────────

type Decisao = {
  categoria: string;
  confianca: string;
  precisa_humano: boolean;
  resposta: string;
};

export type ResultadoChatTikTok = {
  processados: number;
  enviados: number;
  escalados: number;
  propostas: Array<{
    conversation_id: string;
    cliente: string;
    pergunta: string;
    categoria: string;
    confianca: string;
    acao: "responder" | "escalar";
    resposta: string;
  }>;
  erro?: string;
};

async function decidir(
  client: Anthropic,
  contexto: string,
  lojaId: string,
  system: string
): Promise<Decisao | null> {
  const resp = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 400,
    system,
    messages: [{ role: "user", content: contexto }],
  });
  await registrarUsoIA({ lojaId, tipo: "chat", modelo: "claude-haiku-4-5-20251001", marketplace: "tiktok_shop", usage: resp.usage });
  const texto = resp.content.find((b) => b.type === "text")?.text || "";
  try {
    return JSON.parse(texto.match(/\{[\s\S]*\}/)?.[0] || "{}") as Decisao;
  } catch {
    return null;
  }
}

export async function responderChatsTikTokLote({
  lojaId,
  limite = 10,
  enviar = false,
  autonomo = false,
}: {
  lojaId: string;
  limite?: number;
  enviar?: boolean;
  autonomo?: boolean;
}): Promise<ResultadoChatTikTok> {
  // Nome da loja
  const { data: loja } = await supabase
    .from("lojas")
    .select("nome")
    .eq("id", lojaId)
    .maybeSingle();
  const nomeLoja = loja?.nome || "NGK Store";
  const system = montarSystem(nomeLoja);

  // Pendentes
  const { data: pendentes } = await supabase
    .from("chat_conversas")
    .select("conversation_id, to_name, to_id, ultimo_tratado_msg_id, ultima_mensagem, latest_message_id")
    .eq("marketplace", "tiktok_shop")
    .eq("loja_id", lojaId)
    .eq("precisa_resposta", true)
    .order("ultima_mensagem_ts", { ascending: true })
    .limit(limite);

  if (!pendentes?.length) return { processados: 0, enviados: 0, escalados: 0, propostas: [] };

  const t = await obterTokenTikTok(lojaId);
  const client = new Anthropic();

  let enviados = 0;
  let escalados = 0;
  let erroEnvio: string | undefined;
  const propostas: ResultadoChatTikTok["propostas"] = [];

  for (const c of pendentes) {
    // Ignorar se já tratamos este latest_message_id
    if (c.ultimo_tratado_msg_id && c.ultimo_tratado_msg_id === c.latest_message_id) continue;

    // Buscar mensagens
    const msgResp = await listarMensagens(t, c.conversation_id, 20);
    if (msgResp.code !== 0) {
      erroEnvio = `messages[${c.conversation_id}]: ${msgResp.code} ${msgResp.message}`;
      continue;
    }

    const msgs: Array<{
      id: string;
      type: string;
      content: string;
      sender: { role: string; nickname: string };
      create_time: number;
      is_visible: boolean;
    }> = msgResp.data?.messages || [];

    // Só mensagens visíveis e de texto
    const mensagensOrdenadas = msgs
      .filter((m) => m.is_visible && m.type === "TEXT")
      .sort((a, b) => a.create_time - b.create_time)
      .map((m) => {
        let texto = m.content;
        try {
          const parsed = JSON.parse(m.content);
          texto = parsed.content || texto;
        } catch { /* mantém raw */ }
        return {
          de_loja: m.sender.role !== "BUYER",
          nome: m.sender.nickname,
          texto,
        };
      });

    const conversaTxt = mensagensOrdenadas
      .map((m) => `[${m.de_loja ? "Loja" : "Cliente"}] ${m.texto}`)
      .join("\n");

    const ultimaDoCliente = [...mensagensOrdenadas].reverse().find((m) => !m.de_loja);
    const pergunta = ultimaDoCliente?.texto || c.ultima_mensagem || "";

    const temTextoCliente = mensagensOrdenadas.some((m) => !m.de_loja);

    let decisao: Decisao | null = null;
    let escalar: boolean;
    let bloqueadaPorContato = false;
    let categoria = "outro";
    let confianca = "baixa";
    let resposta = "";

    if (!temTextoCliente) {
      escalar = true;
      categoria = "anexo";
    } else {
      const contexto =
        `=== CONVERSA COM ESTE CLIENTE (do início ao fim) ===\n${conversaTxt}\n\n` +
        `Responda à(s) última(s) mensagem(ns) do cliente, considerando TODA a conversa acima.`;

      try {
        decisao = await decidir(client, contexto, lojaId, system);
        if (decisao?.resposta && contemContatoExterno(decisao.resposta)) {
          decisao = await decidir(client, contexto + AVISO_CONTATO, lojaId, system);
          if (decisao?.resposta && contemContatoExterno(decisao.resposta)) {
            bloqueadaPorContato = true;
            decisao = { ...decisao, precisa_humano: true, resposta: "" };
          }
        }
      } catch (e) {
        // Falha transitória — tenta na próxima rodada, mas REGISTRA o motivo
        // (erro engolido esconde robô morto; lição do incidente de 30/09).
        erroEnvio = `decidir: ${e instanceof Error ? e.message : String(e)}`;
        continue;
      }

      escalar = !decisao || decisao.precisa_humano === true || decisao.confianca === "baixa";
      resposta = decisao?.resposta || "";
      categoria = decisao?.categoria || "outro";
      confianca = decisao?.confianca || "baixa";
    }

    if (autonomo && !bloqueadaPorContato && !resposta.trim()) {
      resposta = "Oi! 😊 Recebi sua mensagem. Pode me contar com mais detalhes como posso te ajudar?";
    }
    const deveResponder = resposta.trim().length > 0 && (autonomo || !escalar);

    propostas.push({
      conversation_id: c.conversation_id,
      cliente: c.to_name,
      pergunta: pergunta || "(sem texto — anexo/imagem)",
      categoria,
      confianca,
      acao: deveResponder ? "responder" : "escalar",
      resposta,
    });

    if (!enviar) continue;

    try {
      if (!deveResponder) {
        await supabase
          .from("chat_conversas")
          .update({
            ultimo_tratado_msg_id: c.latest_message_id,
            escalada: true,
            motivo_escala: bloqueadaPorContato
              ? "contato_externo (IA insistiu)"
              : `${categoria} / confiança ${confianca}`,
            categoria,
            confianca,
            resposta_ia: resposta,
          })
          .eq("marketplace", "tiktok_shop")
          .eq("conversation_id", c.conversation_id);

        const botoes = resposta
          ? [
              [{ text: "✅ Aprovar e enviar", callback_data: `tkt:ap:${c.conversation_id}` }],
              [{ text: "✏️ Eu respondo", callback_data: `tkt:rj:${c.conversation_id}` }],
            ]
          : undefined;

        await enviarTelegram(
          `🔔 TikTok Chat — você responde\n\n` +
            (bloqueadaPorContato ? `⚠️ IA pediu contato externo (bloqueado).\n\n` : "") +
            `Cliente: ${c.to_name || "-"}\n` +
            `Assunto: ${categoria} (confiança ${confianca})\n\n` +
            `Cliente disse:\n"${pergunta || "(enviou um anexo/imagem)"}"\n\n` +
            `Sugestão da IA:\n${resposta || "(sem sugestão)"}`,
          botoes as { text: string; callback_data: string }[][] | undefined
        );

        escalados++;
      } else {
        const sendResp = await enviarMensagem(t, c.conversation_id, resposta);
        if (sendResp.code !== 0) throw new Error(`TikTok send: ${sendResp.message}`);

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
          .eq("marketplace", "tiktok_shop")
          .eq("conversation_id", c.conversation_id);

        enviados++;
      }
    } catch (e) {
      erroEnvio = e instanceof Error ? e.message : String(e);
    }
  }

  return { processados: pendentes.length, enviados, escalados, propostas, erro: erroEnvio };
}
