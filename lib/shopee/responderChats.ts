import crypto from "crypto";
import Anthropic from "@anthropic-ai/sdk";
import { supabase } from "@/lib/supabase";
import { enviarTelegram } from "@/lib/telegram";
import { nomeLojaPublico } from "@/lib/shopee/lojas";
import {
  contemContatoExterno,
  contemPromessaRetorno,
  decidirAcao,
  decidirResposta,
  estaAguardandoHumano,
  podeReavisar,
  PREFIXO_AGUARDANDO,
  REGRA_SEM_PROMESSA,
  type Decisao,
} from "@/lib/chat/comum";

const BASE_URL_PADRAO = "https://partner.shopeemobile.com";

// Anexado ao contexto na 2ª tentativa, quando a 1ª resposta citou contato externo.
const AVISO_CONTATO =
  "\n\nATENÇÃO: sua resposta anterior citava contato fora da Shopee (WhatsApp, telefone, e-mail, rede social ou link). Isso é PROIBIDO — a Shopee bloqueia a mensagem e pune a loja. Reescreva resolvendo tudo por aqui, pelo chat da Shopee, sem pedir nem oferecer NENHUM contato externo e sem citar número, e-mail ou link.";

// Erro de envio em que a Shopee recusou o CONTEÚDO (contato externo/palavra sensível).
const RE_ERRO_CONTEUDO =
  /sensitive|prohibit|violat|censor|blocked|not allowed|restricted|banned|illegal|contact info/i;

function montarSystem(nomeLoja: string) {
  return `Você é o atendimento da ${nomeLoja} no chat da Shopee, em português do Brasil. Fale como um vendedor humano de verdade: simpático, direto e prestativo.

Você recebe os dados do produto, os pedidos recentes do cliente, exemplos de respostas antigas da loja e a conversa atual completa. O cliente costuma dividir a dúvida em várias mensagens — leia tudo e responda a última dúvida dele.

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

PEDIDOS DO CLIENTE:
- Você recebe os pedidos recentes deste cliente na loja (número, data, itens, prazo limite de envio e, quando constar, data de envio/entrega). Use para saber de qual produto/pedido ele está falando e para responder sobre prazo de envio.
- Se NÃO constar envio ou entrega, não afirme que o pedido ainda não saiu: diga que o andamento em tempo real aparece no acompanhamento do pedido no app da Shopee.
- A lista pode estar incompleta (só os mais recentes). Se o cliente citar um pedido que não está nela, NUNCA diga que ele "não aparece no sistema" ou que não existe — trate o pedido como válido.

${REGRA_SEM_PROMESSA}

DISPONIBILIDADE / CORES / VARIAÇÕES — regra crítica:
- Você NÃO tem o estoque por cor/variação. Então NUNCA diga que uma cor, tamanho ou variação específica está indisponível — isso costuma ser informação ERRADA.
- Se perguntarem sobre uma cor/variação, responda de forma positiva: as opções disponíveis aparecem nas variações do anúncio, é só selecionar na hora de comprar. (Só diga que está esgotado se o estoque geral do produto for 0.)
- Nunca invente preço, cor, medida ou prazo que não esteja nos dados.

CONTATO FORA DA SHOPEE — regra crítica (a Shopee BLOQUEIA a mensagem e pode punir a loja):
- NUNCA peça nem ofereça WhatsApp, telefone, celular, e-mail, Instagram, Telegram, link ou qualquer contato fora da Shopee. Nada de "me chama no whats", "passa seu número", "manda seu e-mail".
- Todo o atendimento acontece AQUI, pelo chat da Shopee. Se o cliente pedir contato externo ou mandar um número, responda com gentileza que a loja atende só por aqui mesmo, pelo chat, e resolva a dúvida dele por aqui.
- Mesmo que os exemplos antigos da loja ou a conversa tenham pedido contato externo, NÃO repita isso.

QUANDO precisa_humano=true: só quando o caso exige uma decisão ou conferência que só uma pessoa da loja consegue fazer (loja pagar frete da devolução, desconto/negociação, pedido que chegou errado ou faltando item, exceção fora do padrão) ou quando faltam dados pra responder com segurança. Se a conversa mostra que a loja JÁ disse que ia verificar/retornar e o cliente está cobrando, marque precisa_humano=true — não invente uma resposta nova nem repita a promessa. Nesses casos o sistema avisa uma pessoa da equipe na hora, e o campo "resposta" deve ser UMA mensagem curta e tranquila dizendo que alguém da equipe vai olhar o caso e responder por aqui — sem prazo em minutos e sem NUNCA mencionar escalação, prioridade ou processos internos. Na dúvida entre responder e escalar, prefira RESPONDER com a orientação padrão (confianca="alta").

Categorias: "produto" | "envio_prazo" | "pagamento" | "devolucao_reembolso" | "defeito" | "outro".

Responda em JSON com os campos: categoria, confianca ("alta" ou "baixa"), precisa_humano (true/false) e resposta (o texto que vai para o cliente).`;
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

// Envia e devolve o id da mensagem criada (pra reconhecer depois que foi o robô).
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
  const id = data?.response?.message_id;
  return id ? String(id) : null;
}

// Só afirma o que é certo: o status gravado pode estar defasado, então envio e
// entrega só aparecem quando há data registrada.
const STATUS_PEDIDO: Record<string, string> = {
  UNPAID: "aguardando pagamento",
  CANCELLED: "cancelado",
  IN_CANCEL: "cancelamento solicitado",
  TO_RETURN: "em devolução/reembolso",
};

function dataBr(iso: string | null | undefined) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

type PedidoCliente = {
  pedido_externo_id: string | null;
  status: string | null;
  data_pedido: string | null;
  enviado_em: string | null;
  entregue_em: string | null;
  dados_pedido: {
    ship_by_date?: number | string;
    item_list?: {
      item_id?: number;
      item_name?: string;
      model_name?: string;
      model_quantity_purchased?: number;
    }[];
  } | null;
};

// Pedidos recentes do cliente nesta loja: dão ao robô o produto/pedido de que o
// cliente fala (ele raramente diz) em vez de "deixa eu confirmar no sistema".
async function pedidosDoCliente(lojaId: string, clienteNome: string | null) {
  if (!clienteNome) return [] as PedidoCliente[];
  const { data } = await supabase
    .from("pedidos")
    .select("pedido_externo_id, status, data_pedido, enviado_em, entregue_em, dados_pedido")
    .eq("marketplace", "shopee")
    .eq("loja_id", lojaId)
    .eq("cliente_nome", clienteNome)
    .order("data_pedido", { ascending: false })
    .limit(3);
  return (data || []) as PedidoCliente[];
}

function pedidosTxt(pedidos: PedidoCliente[]) {
  if (pedidos.length === 0) return "(nenhum pedido deste cliente encontrado na loja)";
  return pedidos
    .map((p) => {
      const itens = (p.dados_pedido?.item_list || [])
        .map(
          (i) =>
            `${i.model_quantity_purchased ?? 1}x ${i.item_name || "item"}` +
            (i.model_name ? ` (${i.model_name})` : "")
        )
        .join("; ");
      const prazoEnvio = Number(p.dados_pedido?.ship_by_date || 0);
      const partes = [
        `Pedido ${p.pedido_externo_id} — feito em ${dataBr(p.data_pedido) || "?"}`,
        itens ? `itens: ${itens}` : null,
        STATUS_PEDIDO[p.status || ""] ? `situação: ${STATUS_PEDIDO[p.status || ""]}` : null,
        prazoEnvio > 0
          ? `prazo limite pra loja despachar: ${dataBr(new Date(prazoEnvio * 1000).toISOString())}`
          : null,
        p.enviado_em ? `enviado em ${dataBr(p.enviado_em)}` : null,
        p.entregue_em ? `entregue em ${dataBr(p.entregue_em)}` : null,
      ];
      return `- ${partes.filter(Boolean).join(" | ")}`;
    })
    .join("\n");
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
  // Busca folgada e filtra aqui: as já tratadas (escaladas esperando você)
  // continuam com precisa_resposta=true e, com um limite curto, ocupavam a
  // janela inteira e escondiam as conversas novas.
  const { data: conversas } = await supabase
    .from("chat_conversas")
    .select(
      "conversation_id, to_id, to_name, item_id, ultima_mensagem, latest_message_id, ultimo_tratado_msg_id, escalada, motivo_escala, escalada_em"
    )
    .eq("marketplace", "shopee")
    .eq("loja_id", lojaId)
    .eq("precisa_resposta", true)
    .order("ultima_mensagem_ts", { ascending: false })
    .limit(200);

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
    .limit(150);

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
    // …e as promessas de retorno ("deixa eu confirmar com a equipe e já te
    // retorno"): eram o modelo mais repetido e ninguém retornava.
    if (contemPromessaRetorno(t)) continue;
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

  // Grava o estado da conversa; falha de gravação NÃO pode passar em silêncio
  // (a conversa continuaria pendente e o robô responderia de novo).
  async function marcar(conversationId: string, campos: Record<string, unknown>) {
    const { error } = await supabase
      .from("chat_conversas")
      .update(campos)
      .eq("marketplace", "shopee")
      .eq("conversation_id", conversationId);
    if (error) erroEnvio = `gravar conversa: ${error.message}`;
  }

  for (const c of pendentes) {
    const pedidos = await pedidosDoCliente(lojaId, c.to_name);

    // item_id da conversa; se não houver, infere pelo pedido recente do cliente.
    let itemId: number | null = c.item_id ?? null;
    if (!itemId) {
      const primeiro = pedidos[0]?.dados_pedido?.item_list?.[0]?.item_id;
      if (primeiro) itemId = Number(primeiro);
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
          .filter(
            (m) =>
              m.texto &&
              !(m.de_loja && (contemContatoExterno(m.texto) || contemPromessaRetorno(m.texto)))
          )
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
      .order("created_timestamp", { ascending: false })
      .limit(40);

    // Mensagem do cliente sem texto = imagem/figurinha/anexo: entra marcada,
    // pra IA saber que ele mandou algo (antes sumia do contexto).
    const mensagensOrdenadas = (thread || [])
      .slice()
      .reverse()
      .filter((m) => (m.texto || "").trim() || !m.de_loja)
      .map((m) => ({
        de_loja: m.de_loja,
        anexo: !(m.texto || "").trim(),
        texto: (m.texto || "").trim() || "[enviou imagem/anexo, sem texto]",
      }));
    const conversaTxt =
      mensagensOrdenadas.length > 0
        ? mensagensOrdenadas
            .map((m) => `${m.de_loja ? "Loja" : "Cliente"}: ${m.texto}`)
            .join("\n")
        : "(sem mensagens de texto)";

    // Pergunta = última mensagem do cliente (para exibição/notificação).
    const ultimaDoCliente = [...mensagensOrdenadas]
      .reverse()
      .find((m) => !m.de_loja && !m.anexo);
    const pergunta = ultimaDoCliente?.texto || c.ultima_mensagem || "";

    let decisao: Decisao | null = null;
    let bloqueadaPorContato = false;

    let temTextoCliente = mensagensOrdenadas.some((m) => !m.de_loja && !m.anexo);
    // O texto do cliente às vezes só vem no resumo da conversa (ultima_mensagem)
    // e não nas mensagens sincronizadas (ex.: foto com legenda). Usa o resumo
    // antes de tratar como anexo mudo.
    let conversaComFallback = conversaTxt;
    if (!temTextoCliente && (c.ultima_mensagem || "").trim()) {
      conversaComFallback = `${conversaTxt}\nCliente: ${c.ultima_mensagem}`;
      temTextoCliente = true;
    }

    if (temTextoCliente) {
      const contexto =
        `=== PRODUTO ===\n${produtoTxt}\n\n` +
        `=== PEDIDOS RECENTES DESTE CLIENTE NA LOJA ===\n${pedidosTxt(pedidos)}\n\n` +
        `=== RESPOSTAS ANTERIORES DA LOJA NESTE PRODUTO ===\n${historicoTxt}\n\n` +
        `=== CONVERSA ATUAL COM ESTE CLIENTE (do início ao fim) ===\n${conversaComFallback}\n\n` +
        `Responda à(s) última(s) mensagem(ns) do cliente, considerando TODA a conversa acima.`;
      const pedir = (ctx: string) =>
        decidirResposta(client, { system, contexto: ctx, lojaId, marketplace: "shopee" });

      try {
        decisao = await pedir(contexto);
        // Guarda: resposta com contato fora da Shopee (WhatsApp, telefone,
        // e-mail, link) é bloqueada no envio e pode punir a loja. Pede UMA
        // reescrita; se insistir, não envia — vai pra você no Telegram.
        if (decisao?.resposta && contemContatoExterno(decisao.resposta)) {
          decisao = await pedir(contexto + AVISO_CONTATO);
          if (decisao?.resposta && contemContatoExterno(decisao.resposta)) {
            bloqueadaPorContato = true;
            decisao = { ...decisao, precisa_humano: true, resposta: "" };
          }
        }
      } catch (e) {
        // Falha transitória da IA (sobrecarga/rate limit/rede): NÃO derruba o
        // lote inteiro nem marca a conversa. Pula esta e tenta de novo na
        // próxima rodada — mas REGISTRA o motivo (erro engolido esconde robô
        // parado; o vigia avisa se a fila envelhecer).
        erroEnvio = `IA: ${e instanceof Error ? e.message : String(e)}`.slice(0, 300);
        continue;
      }
    }

    const resposta = decisao?.resposta || "";
    const categoria = temTextoCliente ? decisao?.categoria || "outro" : "anexo";
    const confianca = decisao?.confianca || "baixa";
    const aguardando = estaAguardandoHumano(c);
    const ultimaDaLoja = [...mensagensOrdenadas].reverse().find((m) => m.de_loja);

    const acao = decidirAcao({
      decisao,
      autonomo,
      temTextoCliente,
      bloqueadaPorContato,
      jaAguardandoHumano: aguardando,
      ultimaMsgLoja: ultimaDaLoja?.texto || "",
    });

    propostas.push({
      conversation_id: c.conversation_id,
      cliente: c.to_name,
      pergunta: pergunta || "(sem texto — anexo/imagem)",
      categoria,
      confianca,
      acao: acao.tipo === "humano" ? "escalar" : "responder",
      resposta: acao.tipo === "humano" ? resposta : acao.texto,
    });

    if (!enviar) continue; // modo revisão: não envia nem marca

    const agora = new Date().toISOString();
    const cabecalho =
      `Loja: ${nomeLoja}\n` +
      `Cliente: ${c.to_name || "-"}\n` +
      `Produto: ${nomeProduto}\n` +
      `Assunto: ${categoria} (confiança ${confianca})\n\n` +
      `Cliente disse:\n"${pergunta || "(enviou um anexo/imagem)"}"`;

    try {
      if (acao.tipo === "humano") {
        // Cliente já foi avisado e cobrou de novo: re-avisa você, mas sem
        // metralhar o Telegram a cada "?" dele.
        const avisar = !aguardando || podeReavisar(c.escalada_em);
        await marcar(c.conversation_id, {
          ultimo_tratado_msg_id: c.latest_message_id,
          escalada: true,
          motivo_escala: bloqueadaPorContato
            ? "contato_externo (IA insistiu em contato fora da Shopee)"
            : aguardando
              ? c.motivo_escala
              : `${categoria} / confiança ${confianca}`,
          categoria,
          confianca,
          resposta_ia: resposta,
          ...(avisar ? { escalada_em: agora } : {}),
        });

        if (avisar && aguardando) {
          await enviarTelegram(
            `🔁 Cliente cobrando o retorno prometido\n\n${cabecalho}\n\n` +
              `O robô já tinha avisado que alguém da equipe ia responder — ele não vai prometer de novo. Responda pelo chat da Shopee ou em Atendimento.`
          );
        } else if (avisar) {
          // Se houver sugestão, oferece aprovar com 1 toque.
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
              `${cabecalho}\n\n` +
              `Sugestão da IA:\n${resposta || "(sem sugestão)"}`,
            botoes
          );
        }

        escalados++;
      } else {
        const msgId = await enviarMensagem(token, String(c.to_id), acao.texto);
        const base = {
          ultimo_tratado_msg_id: c.latest_message_id,
          precisa_resposta: false,
          ultimo_remetente: "loja",
          categoria,
          confianca,
          resposta_ia: acao.texto,
          respondida_em: agora,
          robo_msg_id: msgId,
        };
        enviados++;

        if (acao.tipo === "espera") {
          // O cliente recebeu "alguém da equipe vai te responder": agora isso
          // TEM de chegar em você (antes a promessa saía e ninguém era avisado).
          await marcar(c.conversation_id, {
            ...base,
            escalada: true,
            escalada_em: agora,
            motivo_escala: `${PREFIXO_AGUARDANDO}: ${categoria}`,
          });
          await enviarTelegram(
            `🟡 Cliente aguardando VOCÊ\n\n${cabecalho}\n\n` +
              `O robô respondeu:\n"${acao.texto}"\n\n` +
              `Ele não consegue resolver esse caso sozinho. Responda pelo chat da Shopee ou em Atendimento.`
          );
          escalados++;
        } else {
          // Resposta normal. Se a conversa espera um humano, continua esperando.
          await marcar(c.conversation_id, {
            ...base,
            ...(aguardando ? {} : { escalada: false }),
          });
        }
      }
    } catch (e) {
      // falha no envio: registra o motivo (antes era engolido).
      const msg = e instanceof Error ? e.message : String(e);
      erroEnvio = msg;
      // Shopee recusou o CONTEÚDO (contato externo/palavra sensível): reenviar
      // o mesmo texto não resolve. Marca como tratada, escala e avisa — antes
      // ficava em loop regenerando (e pagando IA) a cada rodada de 2 min.
      if (RE_ERRO_CONTEUDO.test(msg)) {
        await marcar(c.conversation_id, {
          ultimo_tratado_msg_id: c.latest_message_id,
          escalada: true,
          escalada_em: agora,
          motivo_escala: `bloqueado_shopee: ${msg.slice(0, 160)}`,
          categoria,
          confianca,
          resposta_ia: resposta,
        });
        await enviarTelegram(
          `🚫 Shopee bloqueou a resposta do robô\n\n` +
            `Loja: ${nomeLoja}\n` +
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
        await marcar(c.conversation_id, {
          ultimo_tratado_msg_id: c.latest_message_id,
          precisa_resposta: false,
          escalada: true,
          motivo_escala: "fora_janela_shopee",
          categoria,
          confianca,
          resposta_ia: resposta,
        });
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
