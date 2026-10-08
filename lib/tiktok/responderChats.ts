import Anthropic from "@anthropic-ai/sdk";
import { supabase } from "@/lib/supabase";
import { chamarTikTok } from "@/lib/tiktok/client";
import { garantirTokenTikTok, type LinhaTokenTikTok } from "@/lib/tiktok/token";
import { enviarTelegram } from "@/lib/telegram";
import {
  contemContatoExterno,
  decidirAcao,
  decidirResposta,
  estaAguardandoHumano,
  podeReavisar,
  PREFIXO_AGUARDANDO,
  REGRA_SEM_PROMESSA,
  type Decisao,
} from "@/lib/chat/comum";

const BASE_PATH = "/customer_service/202309";

const AVISO_CONTATO =
  "\n\nATENÇÃO: sua resposta anterior citava contato fora da plataforma (WhatsApp, telefone, e-mail, rede social ou link). Isso vai prejudicar a loja. Reescreva resolvendo tudo aqui, pelo chat do TikTok Shop, sem pedir nem oferecer NENHUM contato externo.";

function montarSystem(nomeLoja: string) {
  return `Você é o atendimento da ${nomeLoja} no chat do TikTok Shop, em português do Brasil. Fale como um vendedor humano de verdade: simpático, direto e prestativo.

Você recebe a conversa atual completa com o cliente. O cliente pode dividir a dúvida em várias mensagens — leia tudo e responda a última dúvida dele. As falas marcadas [Assistente TikTok] são mensagens automáticas do próprio TikTok (confirmação de endereço, rastreio, menu de ajuda): não são respostas da loja — não as repita e não as contradiga.

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

O QUE VOCÊ NÃO ENXERGA — regra crítica:
- Você NÃO tem acesso ao sistema de pedidos nem ao estoque: só vê o que está na conversa (inclusive os cartões de produto/pedido/rastreio, quando aparecem). Então NÃO peça o número do pedido "pra verificar" e não diga que vai conferir onde o pedido está — você não consegue.
- Andamento e prazo: oriente a acompanhar pelo app do TikTok Shop.
- Produto com defeito, veio errado, faltando item ou não chegou constando entregue: a solução é abrir a devolução/reembolso pelo app do TikTok Shop (Pedidos > o pedido > Devolver/Reembolsar, com fotos) — o TikTok analisa e a loja aprova por lá. Explique o passo a passo com acolhimento; isso resolve, precisa_humano=false.
- Só marque precisa_humano=true quando depende de ação da loja: cancelar/alterar um pedido já feito, personalização, reembolso que o cliente diz não ter caído depois de aprovado, ou pedido fora do fluxo do app.
- Medida, cor, material, compatibilidade: só confirme se a informação estiver na conversa (por exemplo no nome do produto do cartão). Senão, diga que os detalhes estão na descrição do anúncio — nunca confirme "de cabeça".

${REGRA_SEM_PROMESSA}

DISPONIBILIDADE / CORES / VARIAÇÕES — regra crítica:
- Se perguntarem sobre uma cor/variação, diga que as opções disponíveis aparecem nas variações do anúncio na hora de comprar.
- Nunca invente preço, cor, medida ou prazo que não esteja nos dados.

CONTATO FORA DO TIKTOK SHOP — regra crítica:
- NUNCA peça nem ofereça WhatsApp, telefone, celular, e-mail, Instagram, Telegram, link ou qualquer contato fora do TikTok Shop.
- Todo o atendimento acontece aqui, pelo chat. Se o cliente pedir contato externo, responda com gentileza que a loja atende só por aqui e resolva a dúvida por aqui.

QUANDO precisa_humano=true: só quando o caso exige decisão ou conferência que só uma pessoa da loja consegue fazer (negociação, cancelar/alterar pedido, pedido que chegou errado ou faltando item, exceção fora do padrão). Se a conversa mostra que a loja JÁ disse que ia verificar/retornar e o cliente está cobrando, marque precisa_humano=true — não invente uma resposta nova nem repita a promessa. Nesses casos o sistema avisa uma pessoa da equipe na hora, e o campo "resposta" deve ser UMA mensagem curta e tranquila que (1) quando existir, diga o que o cliente JÁ pode fazer agora pelo app do TikTok Shop (ex.: abrir a devolução/reembolso do pedido) e (2) diga que alguém da equipe vai olhar o caso e responder por aqui — sem prazo em minutos e sem mencionar processos internos. O campo "resposta" NUNCA fica vazio: todo cliente recebe uma resposta.

Categorias: "produto" | "envio_prazo" | "pagamento" | "devolucao_reembolso" | "defeito" | "outro".

Responda em JSON com os campos: categoria, confianca ("alta" ou "baixa"), precisa_humano (true/false) e resposta (o texto que vai para o cliente).`;
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

async function listarConversas(t: TokenInfo, pageToken = "") {
  // Atenção: o endpoint de CONVERSAS aceita page_size <= 20.
  const query: Record<string, string> = { page_size: "20" };
  if (pageToken) query.page_token = pageToken;
  return chamarTikTok(`${BASE_PATH}/conversations`, {
    method: "GET",
    accessToken: t.accessToken,
    shopCipher: t.shopCipher,
    query,
  });
}

async function listarMensagens(t: TokenInfo, conversationId: string, pageToken = "") {
  // Atenção: o endpoint de MENSAGENS aceita page_size <= 10.
  // need_plaintext traz o conteúdo dos cartões (nome do produto, pedido,
  // rastreio) em texto — sem isso o robô só via "cliente mandou um cartão".
  const query: Record<string, string> = { page_size: "10", need_plaintext: "true" };
  if (pageToken) query.page_token = pageToken;
  return chamarTikTok(`${BASE_PATH}/conversations/${conversationId}/messages`, {
    method: "GET",
    accessToken: t.accessToken,
    shopCipher: t.shopCipher,
    query,
  });
}

// Carrega as mensagens recentes e, se o CLIENTE não aparecer entre as 10
// últimas, volta mais páginas até achá-lo (máx. 4 páginas = 40 msgs). O robô
// do TikTok manda 3-6 mensagens por evento (rastreio, "enviamos", "entregue",
// menu…), então a pergunta do cliente some das 10 últimas em poucas horas — e
// a conversa era dada como "sem cliente" (caso real: cliente transferido pra
// loja, nunca respondido, só avisos do TikTok depois).
async function carregarMensagens(
  t: TokenInfo,
  conversationId: string,
  maxPaginas = 4
): Promise<{ code: number; message?: string; msgs: MsgTikTok[] }> {
  const todas: MsgTikTok[] = [];
  let token = "";
  for (let p = 0; p < maxPaginas; p++) {
    const r = await listarMensagens(t, conversationId, token);
    if (r.code !== 0) {
      if (p === 0) return { code: r.code, message: r.message, msgs: [] };
      break; // fica com o que já veio
    }
    const msgs = (r.data?.messages || []) as MsgTikTok[];
    todas.push(...msgs);
    token = r.data?.next_page_token || "";
    const temCliente = msgs.some((m) => m.is_visible && m.sender?.role === "BUYER");
    if (temCliente || !token || msgs.length === 0) break;
    await pausa(300);
  }
  return { code: 0, msgs: todas };
}

// Encerra a sessão de atendimento (tira a conversa da caixa "Atribuído" do
// Seller Center). Só roda com a chave `tiktok_encerrar_sessao` = 'true' em
// configuracoes — é uma ação visível pro cliente (TikTok pede avaliação do
// atendimento), então fica a critério do dono ligar. Best-effort.
let encerrarSessaoLigado: boolean | null = null;
async function podeEncerrarSessao() {
  if (encerrarSessaoLigado === null) {
    const { data } = await supabase
      .from("configuracoes")
      .select("valor")
      .eq("chave", "tiktok_encerrar_sessao")
      .maybeSingle();
    encerrarSessaoLigado = data?.valor === "true";
  }
  return encerrarSessaoLigado;
}

async function encerrarSessao(t: TokenInfo, conversationId: string) {
  try {
    if (!(await podeEncerrarSessao())) return false;
    const agora = Math.floor(Date.now() / 1000);
    const r = await chamarTikTok(`/customer_service/202602/sessions/search`, {
      method: "POST",
      accessToken: t.accessToken,
      shopCipher: t.shopCipher,
      query: { page_size: "50" },
      body: { begin_time_ge: agora - 7 * 86400, begin_time_lt: agora + 60 },
    });
    const sessoes: { id: string; conversation_id: string; end_time?: number }[] =
      r?.data?.sessions || [];
    const ativa = sessoes.find((s) => s.conversation_id === conversationId && !s.end_time);
    if (!ativa) return false;
    const fim = await chamarTikTok(
      `/customer_service/202605/conversations/${conversationId}/sessions/${ativa.id}/end`,
      { method: "POST", accessToken: t.accessToken, shopCipher: t.shopCipher, body: {} }
    );
    return fim?.code === 0;
  } catch {
    return false;
  }
}

async function enviarMensagem(t: TokenInfo, conversationId: string, texto: string) {
  return chamarTikTok(`${BASE_PATH}/conversations/${conversationId}/messages`, {
    method: "POST",
    accessToken: t.accessToken,
    shopCipher: t.shopCipher,
    body: { type: "TEXT", content: JSON.stringify({ content: texto }) },
  });
}

// Marca as mensagens do cliente como lidas. Responder pela API NÃO zera o
// contador: as conversas que o robô atendia continuavam com o selo de não-lida
// no Seller Center (havia conversa respondida com 41 não-lidas). Best-effort.
async function marcarComoLida(t: TokenInfo, conversationId: string) {
  try {
    await chamarTikTok(`${BASE_PATH}/conversations/${conversationId}/messages/read`, {
      method: "POST",
      accessToken: t.accessToken,
      shopCipher: t.shopCipher,
      body: {},
    });
  } catch {
    // só o selo de não-lida — não pode derrubar o atendimento
  }
}

// Envio avulso (botão "Aprovar" do Telegram / tela de Atendimento).
export async function enviarMensagemTikTokPorLoja(
  lojaId: string,
  conversationId: string,
  texto: string
) {
  const t = await obterTokenTikTok(lojaId);
  const resp = await enviarMensagem(t, conversationId, texto);
  if (resp.code !== 0) throw new Error(`TikTok send: ${resp.message}`);
  await marcarComoLida(t, conversationId);
}

// ── Quem está esperando resposta? ────────────────────────────────────────────

export type MsgTikTok = {
  id: string;
  type: string;
  content: string;
  plaintext?: string | null;
  sender?: { role?: string; nickname?: string };
  create_time: number;
  is_visible: boolean;
};

const ROTULO_TIPO: Record<string, string> = {
  IMAGE: "[enviou uma imagem]",
  VIDEO: "[enviou um vídeo]",
  ORDER_CARD: "[enviou o cartão de um pedido]",
  PRODUCT_CARD: "[enviou o cartão de um produto]",
  LOGISTICS_CARD: "[cartão de rastreio do pedido]",
};

function textoCru(m: MsgTikTok) {
  try {
    const p = JSON.parse(m.content);
    return String(p?.content ?? m.content ?? "");
  } catch {
    return String(m.content || "");
  }
}

function textoDaMensagem(m: MsgTikTok) {
  if (m.type === "TEXT") return textoCru(m);
  const rotulo = ROTULO_TIPO[m.type] || "";
  // Cartões: o plaintext da API traz produto/pedido/rastreio por extenso.
  const detalhe = (m.plaintext || "").replace(/\s+/g, " ").trim().slice(0, 500);
  return rotulo && detalhe ? `${rotulo} ${detalhe}` : rotulo;
}

const ehDaLoja = (m: MsgTikTok) =>
  m.sender?.role === "CUSTOMER_SERVICE" || m.sender?.role === "SHOP";

// O cliente pediu atendente (ou o TikTok transferiu a conversa pra loja). É o
// que o Seller Center lista em "Atribuído", com prazo correndo: a partir daqui
// o assistente do TikTok sai de cena e só uma resposta da LOJA atende.
const ehTransferencia = (m: Pick<MsgTikTok, "type" | "content">) =>
  m.type === "ALLOCATED_SERVICE" ||
  (m.type === "NOTIFICATION" &&
    /manual customer service|atendimento (manual|humano)/i.test(String(m.content || "")));

// Avisos automáticos do TikTok que NÃO respondem dúvida nenhuma (menu de boas-
// vindas, confirmação de endereço, "enviamos seu pedido"…).
const RE_AVISO_TIKTOK =
  /^(agradecemos por entrar em contato|agradecemos por confirmar|agradecemos pelo seu pedido|thank you for|enviamos seu pedido|seu pacote est[aá] pronto|obrigado por ter(es)? (partilhado|compartilhado)|prezado\(a\))/i;

// A última mensagem da conversa quase sempre é do robô do PRÓPRIO TikTok
// (role ROBOT). Decidir por "quem falou por último" fazia o sync achar que a
// loja tinha respondido — e o cliente ficava sem resposta. Aqui olhamos o que
// veio DEPOIS da última mensagem do cliente:
//  - resposta da loja (humano ou nosso robô)                     -> atendido
//  - cliente pediu atendente / conversa transferida pra loja     -> aguardando
//  - resposta do assistente do TikTok em até 3 min (não é aviso) -> atendido
//  - só avisos automáticos, ou nada                              -> aguardando
export function analisarConversa(msgsBrutas: MsgTikTok[]) {
  const msgs = msgsBrutas
    .filter((m) => m.is_visible)
    .sort((a, b) => a.create_time - b.create_time);
  let idx = -1;
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i].sender?.role === "BUYER") {
      idx = i;
      break;
    }
  }
  const agoraSeg = Date.now() / 1000;
  const JANELA = 7 * 24 * 3600; // can_send_message é o limite real; 7 dias é o teto nosso

  // Transferência pra loja tem precedência sobre tudo: a partir dela o
  // assistente do TikTok pode até continuar falando ("[chatbot]…"), mas só
  // resposta da LOJA atende — e a conversa fica em "Atribuído" até isso.
  let idxTransf = -1;
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (ehTransferencia(msgs[i])) {
      idxTransf = i;
      break;
    }
  }
  if (idxTransf !== -1 && !msgs.slice(idxTransf + 1).some(ehDaLoja)) {
    // Referência = última msg do cliente; se ela não está na janela carregada,
    // usa o próprio evento de transferência (o responder trata como "sem texto").
    const ref = idx !== -1 ? msgs[idx] : msgs[idxTransf];
    const noPrazo = agoraSeg - ref.create_time <= JANELA;
    return { msgs, aguardando: noPrazo, pediuHumano: true, cliente: ref };
  }

  const semCliente = { msgs, aguardando: false, pediuHumano: false, cliente: null as MsgTikTok | null };
  if (idx === -1) return semCliente;

  const cliente = msgs[idx];
  const depois = msgs.slice(idx + 1);
  const lojaRespondeu = depois.some(ehDaLoja);
  // Conversa já atribuída à loja (transferência antes desta mensagem do
  // cliente): o "[chatbot]" do TikTok que responde depois não conta — a
  // conversa continua em "Atribuído" até a LOJA falar.
  if (idxTransf !== -1 && idxTransf < idx) {
    const noPrazo = agoraSeg - cliente.create_time <= JANELA;
    return { msgs, aguardando: noPrazo && !lojaRespondeu, pediuHumano: true, cliente };
  }
  // Cartão de produto/pedido sem pergunta: o assistente do TikTok já devolve
  // "em que posso ajudar?" — perguntar de novo só duplica.
  const soCartao = !["TEXT", "IMAGE", "VIDEO"].includes(cliente.type);
  const assistenteRespondeu = depois.some(
    (m) =>
      m.sender?.role === "ROBOT" &&
      m.type === "TEXT" &&
      m.create_time - cliente.create_time <= 180 &&
      (soCartao || !RE_AVISO_TIKTOK.test(textoDaMensagem(m).trim()))
  );
  const recente = agoraSeg - cliente.create_time <= JANELA;
  return {
    msgs,
    aguardando: recente && !lojaRespondeu && !assistenteRespondeu,
    pediuHumano: false,
    cliente,
  };
}

const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── Sincronizar conversas → chat_conversas ───────────────────────────────────

type ConversaTikTok = {
  id: string;
  latest_message?: { sender?: { role?: string }; create_time?: number; id?: string; type?: string; content?: string };
  unread_count: number;
  can_send_message: boolean;
  participants?: Array<{ role: string; nickname: string; im_user_id: string }>;
};

// Lê as conversas mais recentes (pagina até achar só conversa já sincronizada)
// e marca quem está esperando resposta. `forcar` reanalisa as páginas pedidas
// mesmo sem mudança (recupera o que ficou pra trás); `token` continua de onde
// uma chamada anterior parou (`proximoToken`).
export async function sincronizarChatsTikTok(
  lojaId: string,
  {
    paginas = 8,
    forcar = false,
    token = "",
  }: { paginas?: number; forcar?: boolean; token?: string } = {}
) {
  const t = await obterTokenTikTok(lojaId);

  let pageToken = token;
  let paginasSemMudanca = 0;
  let sincronizados = 0;
  let aguardando = 0;
  let analisadas = 0;
  let erro: string | undefined;

  for (let p = 0; p < paginas; p++) {
    const resp = await listarConversas(t, pageToken);
    if (resp.code !== 0) {
      // 1ª página falhou = sync não rodou (o vigia precisa saber).
      if (p === 0) throw new Error(`TikTok conversations: ${resp.code} ${resp.message}`);
      erro = `conversations p${p + 1}: ${resp.code} ${resp.message}`;
      break;
    }
    const convs: ConversaTikTok[] = resp.data?.conversations || [];
    if (convs.length === 0) break;

    const { data: linhas } = await supabase
      .from("chat_conversas")
      .select("conversation_id, latest_message_id, precisa_resposta, escalada, robo_msg_id")
      .eq("marketplace", "tiktok_shop")
      .in("conversation_id", convs.map((c) => c.id));
    const antes = new Map((linhas || []).map((l) => [String(l.conversation_id), l]));

    let mudaram = 0;
    for (const c of convs) {
      const lm = c.latest_message;
      const ant = antes.get(c.id);
      const papel = lm?.sender?.role || "";
      const igual = !!ant && ant.latest_message_id === (lm?.id || null);
      // Vale abrir as mensagens? Só quando há sinal de cliente esperando:
      // não-lidas, pendência anterior, cliente por último ou transferência
      // pra loja. O resto é aviso automático do TikTok.
      const candidata =
        papel === "BUYER" ||
        c.unread_count > 0 ||
        !!ant?.precisa_resposta ||
        ehTransferencia({ type: lm?.type || "", content: lm?.content || "" });
      if (igual && !(forcar && candidata)) continue;
      mudaram++;

      const buyer = c.participants?.find((x) => x.role === "BUYER");
      let precisa = false;
      let clienteMsgId: string | null = null;
      let ultimaMensagem: string | undefined;
      let humanoRespondeu = false;

      if (papel === "CUSTOMER_SERVICE" || papel === "SHOP") {
        // Loja falou por último; se não foi o robô, um humano assumiu.
        humanoRespondeu = !!ant?.escalada && (lm?.id || null) !== ant.robo_msg_id;
      } else if (papel === "BUYER" && !forcar) {
        precisa = c.can_send_message;
        clienteMsgId = lm?.id || null;
        ultimaMensagem = lm ? textoDaMensagem(lm as MsgTikTok) : "";
      } else if (candidata) {
        // Robô/sistema do TikTok falou por último: só as mensagens dizem se o
        // cliente foi atendido.
        const m = await carregarMensagens(t, c.id);
        if (m.code !== 0) {
          // Rate limit/erro: não grava nada — a conversa é relida na próxima rodada.
          erro = `messages[${c.id}]: ${m.code} ${m.message}`;
          if (m.code === 36009002) break;
          continue;
        }
        analisadas++;
        const a = analisarConversa(m.msgs);
        precisa = a.aguardando && c.can_send_message;
        clienteMsgId = a.cliente?.id || null;
        ultimaMensagem = a.cliente ? textoDaMensagem(a.cliente) : undefined;
        await pausa(250);
      }

      const { error } = await supabase.from("chat_conversas").upsert(
        {
          marketplace: "tiktok_shop",
          conversation_id: c.id,
          loja_id: lojaId,
          to_id: buyer?.im_user_id || "",
          to_name: buyer?.nickname || "",
          ultimo_remetente: precisa ? "cliente" : "loja",
          precisa_resposta: precisa,
          unread_count: c.unread_count,
          ultima_mensagem_ts: lm?.create_time ? lm.create_time * 1000 * 1_000_000 : null,
          latest_message_id: lm?.id || null,
          atualizado_em: new Date().toISOString(),
          ...(clienteMsgId ? { cliente_msg_id: clienteMsgId } : {}),
          ...(ultimaMensagem !== undefined ? { ultima_mensagem: ultimaMensagem } : {}),
          ...(humanoRespondeu ? { escalada: false } : {}),
        },
        { onConflict: "marketplace,conversation_id", ignoreDuplicates: false }
      );
      if (error) throw new Error(`upsert chat_conversas: ${error.message}`);
      sincronizados++;
      if (precisa) aguardando++;
    }

    pageToken = resp.data?.next_page_token || "";
    // Duas páginas seguidas sem mudança = chegamos no que o sync anterior já
    // viu. (Uma só não basta: a lista não é estritamente ordenada por última
    // mensagem — eventos de rastreio não sobem a conversa — e uma página sem
    // mudança pode esconder conversa mexida na seguinte.)
    paginasSemMudanca = mudaram === 0 ? paginasSemMudanca + 1 : 0;
    if (!pageToken || (!forcar && paginasSemMudanca >= 2)) break;
    await pausa(300);
  }

  return { conversas: sincronizados, aguardando, analisadas, erro, proximoToken: pageToken };
}

// Reanalisa conversas do BANCO que têm não-lidas e não constam como pendentes:
// são as que o sync antigo deu por respondidas porque o robô do TikTok falou
// por último. `pular` pagina (mais recentes primeiro).
export async function reavaliarNaoLidasTikTok(
  lojaId: string,
  limite = 40,
  pular = 0,
  horas = 48
) {
  const t = await obterTokenTikTok(lojaId);
  const desde = (Date.now() - horas * 3600_000) * 1_000_000; // ultima_mensagem_ts em ns
  const { data: linhas } = await supabase
    .from("chat_conversas")
    .select("conversation_id")
    .eq("marketplace", "tiktok_shop")
    .eq("loja_id", lojaId)
    .eq("precisa_resposta", false)
    .gt("unread_count", 0)
    .gt("ultima_mensagem_ts", desde)
    .order("ultima_mensagem_ts", { ascending: false })
    .range(pular, pular + limite - 1);

  let analisadas = 0;
  let aguardando = 0;
  let erro: string | undefined;
  for (const l of linhas || []) {
    const id = String(l.conversation_id);
    const m = await carregarMensagens(t, id);
    if (m.code !== 0) {
      erro = `messages[${id}]: ${m.code} ${m.message}`;
      if (m.code === 36009002) break;
      continue;
    }
    analisadas++;
    const a = analisarConversa(m.msgs);
    if (a.aguardando && a.cliente) {
      const { error } = await supabase
        .from("chat_conversas")
        .update({
          precisa_resposta: true,
          ultimo_remetente: "cliente",
          cliente_msg_id: a.cliente.id,
          ultima_mensagem: textoDaMensagem(a.cliente),
          atualizado_em: new Date().toISOString(),
        })
        .eq("marketplace", "tiktok_shop")
        .eq("conversation_id", id);
      if (error) erro = `gravar conversa: ${error.message}`;
      else aguardando++;
    }
    await pausa(400);
  }
  return { candidatas: (linhas || []).length, analisadas, aguardando, erro };
}

// Reanalisa as conversas com SESSÃO DE ATENDIMENTO ATIVA (= caixa "Atribuído"
// do Seller Center) nos últimos 7 dias: é a lista exata do que o dono vê como
// aberto. As que estiverem esperando a loja voltam pra fila do robô.
export async function reavaliarSessoesAtivasTikTok(lojaId: string) {
  const t = await obterTokenTikTok(lojaId);
  const agora = Math.floor(Date.now() / 1000);
  const sessoes: { id: string; conversation_id: string; end_time?: number; buyer_nickname?: string }[] = [];
  let token = "";
  for (let p = 0; p < 10; p++) {
    const q: Record<string, string> = { page_size: "100" };
    if (token) q.page_token = token;
    const r = await chamarTikTok(`/customer_service/202602/sessions/search`, {
      method: "POST",
      accessToken: t.accessToken,
      shopCipher: t.shopCipher,
      query: q,
      body: { begin_time_ge: agora - 7 * 86400, begin_time_lt: agora + 60 },
    });
    if (r?.code !== 0) throw new Error(`sessions/search: ${r?.code} ${r?.message}`);
    sessoes.push(...((r.data?.sessions || []) as typeof sessoes));
    token = r.data?.next_page_token || "";
    if (!token) break;
    await pausa(300);
  }
  const ativas = sessoes.filter((s) => !s.end_time);
  const vistas = new Set<string>();
  let aguardando = 0;
  let analisadas = 0;
  let erro: string | undefined;
  const esperando: string[] = [];
  for (const s of ativas) {
    if (vistas.has(s.conversation_id)) continue;
    vistas.add(s.conversation_id);
    const m = await carregarMensagens(t, s.conversation_id);
    if (m.code !== 0) {
      erro = `messages[${s.conversation_id}]: ${m.code} ${m.message}`;
      if (m.code === 36009002) break;
      continue;
    }
    analisadas++;
    const a = analisarConversa(m.msgs);
    if (a.aguardando && a.cliente) {
      const { error } = await supabase
        .from("chat_conversas")
        .update({
          precisa_resposta: true,
          ultimo_remetente: "cliente",
          cliente_msg_id: a.cliente.id,
          ultima_mensagem: textoDaMensagem(a.cliente),
          atualizado_em: new Date().toISOString(),
        })
        .eq("marketplace", "tiktok_shop")
        .eq("conversation_id", s.conversation_id);
      if (error) erro = `gravar conversa: ${error.message}`;
      else {
        aguardando++;
        esperando.push(`${s.buyer_nickname || s.conversation_id}`);
      }
    }
    await pausa(400);
  }
  return { sessoes: sessoes.length, ativas: ativas.length, analisadas, aguardando, esperando, erro };
}

// ── Responder conversas pendentes ────────────────────────────────────────────

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

  // Pendentes (mais antigo primeiro). Busca folgada e filtra aqui: as já
  // tratadas que esperam você continuam com precisa_resposta=true e, com um
  // limite curto, ocupavam a janela inteira e travavam a fila.
  const { data: candidatas } = await supabase
    .from("chat_conversas")
    .select(
      "conversation_id, to_name, to_id, ultimo_tratado_msg_id, ultima_mensagem, latest_message_id, cliente_msg_id, escalada, motivo_escala, escalada_em"
    )
    .eq("marketplace", "tiktok_shop")
    .eq("loja_id", lojaId)
    .eq("precisa_resposta", true)
    .order("ultima_mensagem_ts", { ascending: true })
    .limit(200);

  const pendentes = (candidatas || [])
    .filter((c) => (c.ultimo_tratado_msg_id || "") !== (c.cliente_msg_id || c.latest_message_id || ""))
    .slice(0, limite);

  if (!pendentes.length) return { processados: 0, enviados: 0, escalados: 0, propostas: [] };

  const t = await obterTokenTikTok(lojaId);
  const client = new Anthropic();

  let enviados = 0;
  let escalados = 0;
  let erroEnvio: string | undefined;
  const propostas: ResultadoChatTikTok["propostas"] = [];

  async function marcar(conversationId: string, campos: Record<string, unknown>) {
    const { error } = await supabase
      .from("chat_conversas")
      .update(campos)
      .eq("marketplace", "tiktok_shop")
      .eq("conversation_id", conversationId);
    if (error) erroEnvio = `gravar conversa: ${error.message}`;
  }

  for (const c of pendentes) {
    // Buscar mensagens
    const msgResp = await carregarMensagens(t, c.conversation_id);
    if (msgResp.code !== 0) {
      erroEnvio = `messages[${c.conversation_id}]: ${msgResp.code} ${msgResp.message}`;
      if (msgResp.code === 36009002) break; // rate limit: para e retoma na próxima rodada
      continue;
    }

    // Confere de novo na hora de responder: entre o sync e agora a loja ou o
    // assistente do TikTok podem já ter respondido (evita resposta em dobro).
    const analise = analisarConversa(msgResp.msgs);
    if (!analise.aguardando || !analise.cliente) {
      if (enviar) await marcar(c.conversation_id, { precisa_resposta: false, ultimo_remetente: "loja" });
      continue;
    }
    // Dá ~45s pro assistente do TikTok responder primeiro (ele leva ~10s).
    if (Date.now() / 1000 - analise.cliente.create_time < 45) continue;
    const clienteMsgId = analise.cliente.id;

    const mensagensOrdenadas = analise.msgs
      .map((m) => ({
        papel: m.sender?.role === "BUYER" ? "Cliente" : ehDaLoja(m) ? "Loja" : "Assistente TikTok",
        anexo: m.type !== "TEXT",
        texto: textoDaMensagem(m).trim(),
      }))
      .filter((m) => m.texto);

    const conversaTxt = mensagensOrdenadas.map((m) => `[${m.papel}] ${m.texto}`).join("\n");

    const ultimaDoCliente = [...mensagensOrdenadas]
      .reverse()
      .find((m) => m.papel === "Cliente" && !m.anexo);
    const pergunta = ultimaDoCliente?.texto || c.ultima_mensagem || "";
    const temTextoCliente = !!ultimaDoCliente;

    let decisao: Decisao | null = null;
    let bloqueadaPorContato = false;

    if (temTextoCliente) {
      const contexto =
        `=== CONVERSA COM ESTE CLIENTE (do início ao fim) ===\n${conversaTxt}\n\n` +
        (analise.pediuHumano
          ? `ATENÇÃO: depois da resposta do Assistente TikTok, o cliente pediu para falar com um atendente da loja — a resposta automática não resolveu. Responda você, como atendente, sem repetir o que o assistente já disse.\n\n`
          : "") +
        `Responda à(s) última(s) mensagem(ns) do cliente, considerando TODA a conversa acima.`;
      const pedir = (ctx: string) =>
        decidirResposta(client, { system, contexto: ctx, lojaId, marketplace: "tiktok_shop" });

      try {
        decisao = await pedir(contexto);
        if (decisao?.resposta && contemContatoExterno(decisao.resposta)) {
          decisao = await pedir(contexto + AVISO_CONTATO);
          if (decisao?.resposta && contemContatoExterno(decisao.resposta)) {
            bloqueadaPorContato = true;
            decisao = { ...decisao, precisa_humano: true, resposta: "" };
          }
        }
      } catch (e) {
        // Falha transitória — tenta na próxima rodada, mas REGISTRA o motivo
        // (erro engolido esconde robô morto; lição do incidente de 30/09).
        erroEnvio = `IA: ${e instanceof Error ? e.message : String(e)}`.slice(0, 300);
        continue;
      }
    }

    const resposta = decisao?.resposta || "";
    const categoria = temTextoCliente ? decisao?.categoria || "outro" : "anexo";
    const confianca = decisao?.confianca || "baixa";
    const aguardando = estaAguardandoHumano(c);
    const ultimaDaLoja = [...mensagensOrdenadas].reverse().find((m) => m.papel === "Loja");

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

    if (!enviar) continue;

    const agora = new Date().toISOString();
    const cabecalho =
      `Loja: ${nomeLoja} (TikTok)\n` +
      `Cliente: ${c.to_name || "-"}\n` +
      `Assunto: ${categoria} (confiança ${confianca})\n\n` +
      `Cliente disse:\n"${pergunta || "(enviou um anexo/imagem)"}"`;

    try {
      if (acao.tipo === "humano") {
        const avisar = !aguardando || podeReavisar(c.escalada_em);
        await marcar(c.conversation_id, {
          ultimo_tratado_msg_id: clienteMsgId,
          cliente_msg_id: clienteMsgId,
          escalada: true,
          motivo_escala: bloqueadaPorContato
            ? "contato_externo (IA insistiu)"
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
            `🔁 TikTok — cliente cobrando o retorno prometido\n\n${cabecalho}\n\n` +
              `O robô já tinha avisado que alguém da equipe ia responder — ele não vai prometer de novo. Responda pelo TikTok Shop ou em Atendimento.`
          );
        } else if (avisar) {
          const botoes = resposta
            ? [
                [{ text: "✅ Aprovar e enviar", callback_data: `tkt:ap:${c.conversation_id}` }],
                [{ text: "✏️ Eu respondo", callback_data: `tkt:rj:${c.conversation_id}` }],
              ]
            : undefined;

          await enviarTelegram(
            `🔔 TikTok Chat — você responde\n\n` +
              (bloqueadaPorContato ? `⚠️ IA pediu contato externo (bloqueado).\n\n` : "") +
              `${cabecalho}\n\n` +
              `Sugestão da IA:\n${resposta || "(sem sugestão)"}`,
            botoes
          );
        }

        escalados++;
      } else {
        const sendResp = await enviarMensagem(t, c.conversation_id, acao.texto);
        if (sendResp.code !== 0) throw new Error(`TikTok send: ${sendResp.code} ${sendResp.message}`);
        const msgId = sendResp.data?.message_id ? String(sendResp.data.message_id) : null;
        const base = {
          ultimo_tratado_msg_id: clienteMsgId,
          cliente_msg_id: clienteMsgId,
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
          // Fica como NÃO-LIDA no Seller Center de propósito: é com você.
          // Se ele já estava esperando e cobrou de novo, re-avisa — mas sem
          // metralhar o Telegram a cada "?" dele.
          const avisar = !aguardando || podeReavisar(c.escalada_em);
          await marcar(c.conversation_id, {
            ...base,
            escalada: true,
            motivo_escala: aguardando
              ? c.motivo_escala
              : `${PREFIXO_AGUARDANDO}: ${bloqueadaPorContato ? "contato_externo" : categoria}`,
            ...(avisar ? { escalada_em: agora } : {}),
          });
          if (avisar) {
            await enviarTelegram(
              (aguardando
                ? `🔁 TikTok — cliente cobrando o retorno prometido`
                : `🟡 TikTok — cliente aguardando VOCÊ`) +
                `\n\n${cabecalho}\n\n` +
                `O robô respondeu:\n"${acao.texto}"\n\n` +
                `Ele não consegue resolver esse caso sozinho. Responda pelo TikTok Shop ou em Atendimento.`
            );
          }
          escalados++;
          // O selo de não-lida sai sempre: pro dono, "não lida" = "aberta". O
          // caso continua esperando gente em Atendimento + Telegram; a sessão
          // segue ativa no Seller Center (não encerramos o que precisa de humano).
          await marcarComoLida(t, c.conversation_id);
        } else {
          await marcar(c.conversation_id, {
            ...base,
            ...(aguardando ? {} : { escalada: false }),
          });
          await marcarComoLida(t, c.conversation_id);
          // Resolvido pelo robô: encerra a sessão de atendimento (sai de
          // "Atribuído") — só se a chave tiktok_encerrar_sessao estiver ligada.
          if (!aguardando) await encerrarSessao(t, c.conversation_id);
        }
      }
    } catch (e) {
      erroEnvio = e instanceof Error ? e.message : String(e);
    }
  }

  return { processados: pendentes.length, enviados, escalados, propostas, erro: erroEnvio };
}
