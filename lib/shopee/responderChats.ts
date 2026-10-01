import crypto from "crypto";
import Anthropic from "@anthropic-ai/sdk";
import { supabase } from "@/lib/supabase";
import { enviarTelegram } from "@/lib/telegram";
import { registrarUsoIA } from "@/lib/uso";
import { nomeLojaPublico } from "@/lib/shopee/lojas";

const BASE_URL_PADRAO = "https://partner.shopeemobile.com";

// Contato fora da Shopee (WhatsApp, telefone, e-mail, redes sociais, links).
// A Shopee BLOQUEIA a mensagem no envio e pode penalizar a loja — então isso
// nunca pode sair do robô: nem como exemplo pra IA, nem na resposta final.
// Cobre: apps/redes (whats, zap, insta…), e-mail, links (http/www/.com/.br),
// telefone BR — (11) 91234-5678, 11912345678, 11 1234 5678 — e frases do tipo
// "me passa seu número" / "fora da Shopee" / "me liga".
const RE_CONTATO_EXTERNO =
  /whats|wpp|\bzap\b|zapzap|telegram|instagram|\binsta\b|facebook|messenger|e-?mail|https?:\/\/|www\.|\.com\b|\.br\b|\(?\d{2}\)?\s?9?\s?\d{4}[-.\s]?\d{4}|fora da (shopee|plataforma)|por fora|(meu|seu|teu) n[uú]mero|n[uú]mero (de|do) (telefone|celular|contato|whats)|me liga|te ligo|ligar pra/i;

export function contemContatoExterno(texto: string | null | undefined) {
  return RE_CONTATO_EXTERNO.test(texto || "");
}

// Anexado ao contexto na 2ª tentativa, quando a 1ª resposta citou contato externo.
const AVISO_CONTATO =
  "\n\nATENÇÃO: sua resposta anterior citava contato fora da Shopee (WhatsApp, telefone, e-mail, rede social ou link). Isso é PROIBIDO — a Shopee bloqueia a mensagem e pune a loja. Reescreva resolvendo tudo por aqui, pelo chat da Shopee, sem pedir nem oferecer NENHUM contato externo e sem citar número, e-mail ou link.";

// Erro de envio em que a Shopee recusou o CONTEÚDO (contato externo/palavra sensível).
const RE_ERRO_CONTEUDO =
  /sensitive|prohibit|violat|censor|blocked|not allowed|restricted|banned|illegal|contact info/i;

function montarSystem(nomeLoja: string) {
  return `Você é o atendimento da ${nomeLoja} no chat da Shopee, em português do Brasil. Fale como um vendedor humano de verdade: simpático, direto e prestativo.

Você recebe os dados do produto, exemplos de respostas antigas da loja e a conversa atual completa. O cliente costuma dividir a dúvida em várias mensagens — leia tudo e responda a última dúvida dele.

COMO ESCREVER (muito importante):
- Curto e natural: normalmente 1 a 3 frases. Uma pessoa real não escreve textão.
- Sem drama e sem CAIXA ALTA pra enfatizar. É PROIBIDO usar palavras como "PRIORIDADE MÁXIMA", "protocolo", "escalado", "responsável", "poder de decisão", "AGORA MESMO". Nunca fale de processos internos da loja com o cliente.
- No máximo 1 emoji. Não repita o nome do cliente, não encha de exclamações.
- Vá direto na informação que resolve, com gentileza. Sem enrolação e sem prometer o que não pode cumprir.

O QUE VOCÊ RESOLVE (responda, não escale):
- Produto: responda pela descrição e pelos exemplos.
- Envio/prazo: o pedido é despachado dentro do prazo de manuseio do anúncio; o prazo de ENTREGA aparece no acompanhamento do pedido no app da Shopee. Tranquilize e oriente a acompanhar por lá.
- Pagamento: tratado no próprio app da Shopee (Eu > Central de Ajuda). Oriente com gentileza.
- Devolução/Reembolso: o cliente abre pelo app (Eu > Minhas Compras > o pedido > "Devolução/Reembolso") e a loja apoia. Seja acolhedor e explique o passo a passo de forma curta.

DISPONIBILIDADE / CORES / VARIAÇÕES — regra crítica:
- Você NÃO tem o estoque por cor/variação. Então NUNCA diga que uma cor, tamanho ou variação específica está indisponível — isso costuma ser informação ERRADA.
- Se perguntarem sobre uma cor/variação, responda de forma positiva: as opções disponíveis aparecem nas variações do anúncio, é só selecionar na hora de comprar. (Só diga que está esgotado se o estoque geral do produto for 0.)
- Nunca invente preço, cor, medida ou prazo que não esteja nos dados.

CONTATO FORA DA SHOPEE — regra crítica (a Shopee BLOQUEIA a mensagem e pode punir a loja):
- NUNCA peça nem ofereça WhatsApp, telefone, celular, e-mail, Instagram, Telegram, link ou qualquer contato fora da Shopee. Nada de "me chama no whats", "passa seu número", "manda seu e-mail".
- Todo o atendimento acontece AQUI, pelo chat da Shopee. Se o cliente pedir contato externo ou mandar um número, responda com gentileza que a loja atende só por aqui mesmo, pelo chat, e resolva a dúvida dele por aqui.
- Mesmo que os exemplos antigos da loja ou a conversa tenham pedido contato externo, NÃO repita isso.

QUANDO precisa_humano=true: só quando o caso exige uma decisão manual que as orientações não cobrem (loja pagar frete da devolução, desconto/negociação, exceção fora do padrão) ou quando faltam dados pra responder com segurança. MESMO ASSIM, o campo "resposta" deve ser uma mensagem CURTA e tranquila pro cliente, ex.: "Deixa eu confirmar isso certinho pra te passar a resposta correta e já te retorno, tá? 🙏" — sem NUNCA mencionar escalação, prioridade ou processos internos. Na dúvida entre responder e escalar, prefira RESPONDER com a orientação padrão (confianca="alta").

Categorias: "produto" | "envio_prazo" | "pagamento" | "devolucao_reembolso" | "defeito" | "outro".

Responda APENAS com um JSON válido, sem nenhum texto fora dele, no formato:
{"categoria":"produto|envio_prazo|pagamento|devolucao_reembolso|defeito|outro","confianca":"alta|baixa","precisa_humano":true|false,"resposta":"..."}`;
}

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
  contexto: string,
  lojaId: string,
  system: string
): Promise<Decisao | null> {
  const r = await client.messages.create({
    model: "claude-haiku-4-5",
    // Cap baixo: resposta curta e humana (1-3 frases) + os campos do JSON.
    max_tokens: 400,
    // system (fixo por loja: instruções + exemplos) marcado para CACHE de prompt.
    system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: contexto }],
  });
  // Mede o consumo (base de cobrança por conta). Best-effort.
  await registrarUsoIA({
    lojaId,
    tipo: "chat",
    modelo: "claude-haiku-4-5",
    usage: r.usage,
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
  foraJanela?: number;
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
  const nomeLoja = await nomeLojaPublico(lojaId); // nome individual da loja

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
    // pula saudações curtas/repetidas E os textões dramáticos antigos (>320)
    // pra eles não virarem "modelo" e realimentarem o tom exagerado.
    // …e os que pediam contato fora da Shopee (WhatsApp etc.): viravam
    // "modelo" e o robô repetia — a Shopee bloqueia a resposta.
    if (t.length < 20 || t.length > 320 || vistos.has(t)) continue;
    if (contemContatoExterno(t)) continue;
    vistos.add(t);
    exemplosLoja.push(t);
    if (exemplosLoja.length >= 30) break;
  }
  const exemplosTxt =
    exemplosLoja.length > 0
      ? exemplosLoja.map((t) => `- ${t}`).join("\n")
      : "(sem exemplos)";

  // Prompt FIXO por loja (instruções + exemplos): idêntico em todas as conversas
  // desta rodada -> marcado para CACHE (paga ~10% nas repetições em vez de 100%).
  const system =
    montarSystem(nomeLoja) +
    `\n\n=== COMO A ${nomeLoja.toUpperCase()} JÁ RESPONDEU (exemplos reais — siga o mesmo tom e orientações) ===\n${exemplosTxt}`;

  let enviados = 0;
  let escalados = 0;
  let foraJanela = 0;
  let erroEnvio: string | undefined;
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
          .filter((m) => m.texto && !(m.de_loja && contemContatoExterno(m.texto)))
          .map((m) => `${m.de_loja ? "Loja" : "Cliente"}: ${m.texto}`)
          .join("\n");
      }
    }

    // Conversa COMPLETA (do início ao fim) — o cliente costuma quebrar a
    // dúvida em várias mensagens; o robô precisa de todo o contexto.
    const { data: thread } = await supabase
      .from("chat_mensagens")
      .select("de_loja, texto, created_timestamp")
      .eq("marketplace", "shopee").eq("conversation_id", c.conversation_id)
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

    let decisao: Decisao | null = null;
    let escalar: boolean;
    let bloqueadaPorContato = false;
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
        `=== RESPOSTAS ANTERIORES DA LOJA NESTE PRODUTO ===\n${historicoTxt}\n\n` +
        `=== CONVERSA ATUAL COM ESTE CLIENTE (do início ao fim) ===\n${conversaTxt}\n\n` +
        `Responda à(s) última(s) mensagem(ns) do cliente, considerando TODA a conversa acima.`;

      try {
        decisao = await decidir(client, contexto, lojaId, system);
        // Guarda: resposta com contato fora da Shopee (WhatsApp, telefone,
        // e-mail, link) é bloqueada no envio e pode punir a loja. Pede UMA
        // reescrita; se insistir, não envia — vai pra você no Telegram.
        if (decisao?.resposta && contemContatoExterno(decisao.resposta)) {
          decisao = await decidir(client, contexto + AVISO_CONTATO, lojaId, system);
          if (decisao?.resposta && contemContatoExterno(decisao.resposta)) {
            bloqueadaPorContato = true;
            decisao = { ...decisao, precisa_humano: true, resposta: "" };
          }
        }
      } catch {
        // Falha transitória da IA (sobrecarga/rate limit/rede): NÃO derruba o
        // lote inteiro nem marca a conversa. Pula esta e tenta de novo na
        // próxima rodada — assim nenhuma mensagem fica órfã por causa de 1 erro.
        continue;
      }
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
    if (autonomo && !bloqueadaPorContato && !resposta.trim()) {
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
            motivo_escala: bloqueadaPorContato
              ? "contato_externo (IA insistiu em contato fora da Shopee)"
              : `${categoria} / confiança ${confianca}`,
            categoria,
            confianca,
            resposta_ia: resposta,
          })
          .eq("marketplace", "shopee").eq("conversation_id", c.conversation_id);

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
            (bloqueadaPorContato
              ? `⚠️ A IA insistiu em pedir contato fora da Shopee (bloqueado). Responda por aqui, pelo chat.\n\n`
              : "") +
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
          .eq("marketplace", "shopee").eq("conversation_id", c.conversation_id);
        enviados++;
      }
    } catch (e) {
      // falha no envio: registra o motivo (antes era engolido).
      const msg = e instanceof Error ? e.message : String(e);
      erroEnvio = msg;
      // Shopee recusou o CONTEÚDO (contato externo/palavra sensível): reenviar
      // o mesmo texto não resolve. Marca como tratada, escala e avisa — antes
      // ficava em loop regenerando (e pagando IA) a cada rodada de 2 min.
      if (RE_ERRO_CONTEUDO.test(msg)) {
        await supabase
          .from("chat_conversas")
          .update({
            ultimo_tratado_msg_id: c.latest_message_id,
            escalada: true,
            motivo_escala: `bloqueado_shopee: ${msg.slice(0, 160)}`,
            categoria,
            confianca,
            resposta_ia: resposta,
          })
          .eq("marketplace", "shopee").eq("conversation_id", c.conversation_id);
        await enviarTelegram(
          `🚫 Shopee bloqueou a resposta do robô\n\n` +
            `Cliente: ${c.to_name || "-"}\n` +
            `Produto: ${nomeProduto}\n` +
            `Motivo: ${msg.slice(0, 200)}\n\n` +
            `Cliente disse:\n"${pergunta}"\n\n` +
            `Responda por aqui, pelo chat da Shopee, sem contato externo.`
        );
        escalados++;
        continue;
      }
      // Fora da janela de mensagem da Shopee (só dá pra responder se o cliente
      // falou nos últimos 7 dias / comprou em 30 dias / tem devolução aberta):
      // não adianta re-tentar — nem manualmente dá. Marca como tratada pra não
      // travar a fila reprocessando a mesma conversa a cada rodada.
      if (/forbidden|only message the buyer/i.test(msg)) {
        await supabase
          .from("chat_conversas")
          .update({
            ultimo_tratado_msg_id: c.latest_message_id,
            precisa_resposta: false,
            escalada: true,
            motivo_escala: "fora_janela_shopee",
            categoria,
            confianca,
            resposta_ia: resposta,
          })
          .eq("marketplace", "shopee").eq("conversation_id", c.conversation_id);
        foraJanela++;
      }
      // outros erros (token/rede/transitório): deixa pendente pra próxima rodada.
    }
  }

  return {
    processados: pendentes.length,
    enviados,
    escalados,
    foraJanela,
    propostas,
    erro: erroEnvio,
  };
}
