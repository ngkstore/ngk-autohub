import Anthropic from "@anthropic-ai/sdk";
import { registrarUsoIA } from "@/lib/uso";

// Regras compartilhadas pelos robôs de chat (Shopee e TikTok Shop).

const MODELO = "claude-haiku-4-5";

// Contato fora da plataforma (WhatsApp, telefone, e-mail, redes sociais, links).
// A Shopee BLOQUEIA a mensagem no envio e pode penalizar a loja — então isso
// nunca pode sair do robô: nem como exemplo pra IA, nem na resposta final.
// O telefone exige estar "solto" (sem letra/dígito colado): código de rastreio
// (BR2667547517493) e número de pedido do TikTok (18 dígitos) batiam no padrão
// antigo, a resposta era barrada e a conversa ia pra você sem sugestão.
const RE_CONTATO_EXTERNO =
  /whats|wpp|\bzap\b|zapzap|telegram|instagram|\binsta\b|facebook|messenger|e-?mail|https?:\/\/|www\.|\.com\b|\.br\b|(?<![\dA-Za-z])\(?\d{2}\)?\s?9?\s?\d{4}[-.\s]?\d{4}(?![\dA-Za-z])|fora da (shopee|plataforma|tiktok)|por fora|(meu|seu|teu) n[uú]mero(?! (do|de|da) (pedido|rastreio|rastreamento|protocolo|nota|compra))|n[uú]mero (de|do) (telefone|celular|contato|whats)|me liga|te ligo|ligar pra/i;

export function contemContatoExterno(texto: string | null | undefined) {
  return RE_CONTATO_EXTERNO.test(texto || "");
}

// Promessa de retorno ("já te retorno", "vou verificar com a equipe"…). O robô
// NÃO consegue voltar depois: cada resposta dele é a única. Toda promessa vira
// obrigatoriamente um chamado pra um humano — antes ela era enviada e ninguém
// ficava sabendo (71 conversas numa semana terminaram assim, com o cliente
// cobrando "aguardando", "?????").
const RE_PROMESSA =
  /te retorno|retorno (com|pra|para|em|assim)|volto (com|a falar|pra|para|em|aqui|j[aá])|deixa eu (confirmar|verificar|conferir|checar|trazer|ver|consultar)|vou (verificar|confirmar|conferir|checar|consultar|averiguar|trazer|acionar|chamar|pedir pra)|te aviso|te dou (um )?retorno|assim que (eu )?(tiver|souber|conseguir)|em (poucos|alguns) minutos|j[aá] te (passo|respondo|falo)|te (respondemos|retornamos|avisamos)|(retornaremos|responderemos|entraremos em contato)|(algu[eé]m|equipe|time|atendente)[^.!?]{0,40}(vai|ir[aá]) (te )?(responder|retornar|olhar|verificar|analisar|conferir)/i;

// Termina perguntando algo ao cliente? (ignora emoji e o "tá?/ok?" de cortesia)
function terminaEmPergunta(texto: string) {
  const semCortesia = texto
    .trim()
    .replace(/[\s\p{Extended_Pictographic}️]+$/u, "")
    .replace(/,?\s*(t[aá]|ok|certo|combinado|beleza|viu|pode ser)\s*\?$/i, "");
  return /\?$/.test(semCortesia);
}

export function contemPromessaRetorno(texto: string | null | undefined) {
  const t = (texto || "").trim();
  if (!RE_PROMESSA.test(t)) return false;
  // "Deixa eu confirmar: você quer a boneca ou o carrinho?" é pergunta de
  // esclarecimento (o cliente responde e a conversa segue), não promessa.
  return !terminaEmPergunta(t);
}

// Mensagem enviada quando o caso precisa de uma pessoa e a IA não escreveu nada.
export const MSG_ESPERA_PADRAO =
  "Vou pedir pra alguém da nossa equipe olhar seu caso com atenção e te respondemos por aqui mesmo, tá? 🙏";

// Cliente mandou só imagem/anexo, sem texto.
export const MSG_PEDIR_DETALHES =
  "Oi! 😊 Recebi sua mensagem. Pode me contar com mais detalhes como posso te ajudar?";

// Bloco do prompt, igual nas duas plataformas.
export const REGRA_SEM_PROMESSA = `VOCÊ NÃO CONSEGUE VOLTAR DEPOIS — regra crítica:
- Cada resposta sua é a ÚNICA: você não tem como "verificar e retornar". Então NUNCA escreva "já te retorno", "vou verificar", "deixa eu confirmar com a equipe", "volto em poucos minutos" numa resposta normal. Isso deixa o cliente esperando uma resposta que nunca chega.
- Resolva AGORA com o que você tem (dados do produto, pedidos do cliente, orientações padrão). Se faltar um dado do cliente, PERGUNTE (ex.: o número do pedido).
- Só existe UM caso em que você pode dizer que alguém vai retornar: quando marcar precisa_humano=true. Aí o sistema chama uma pessoa da loja de verdade.

ASSUNTOS QUE NÃO SÃO SEUS — regra crítica:
- Proposta de parceria, criador de conteúdo/afiliado/influenciador, live, amostra grátis, fornecedor, atacado/revenda, publicidade ou qualquer assunto comercial que não seja a compra do cliente: você NÃO sabe a política da loja. Nunca diga que a loja tem ou não tem programa, parceria ou interesse. Marque precisa_humano=true.`;

export type Decisao = {
  categoria: string;
  confianca: string;
  precisa_humano: boolean;
  resposta: string;
};

const ESQUEMA_DECISAO = {
  type: "object",
  properties: {
    categoria: {
      type: "string",
      enum: ["produto", "envio_prazo", "pagamento", "devolucao_reembolso", "defeito", "outro"],
    },
    confianca: { type: "string", enum: ["alta", "baixa"] },
    precisa_humano: { type: "boolean" },
    resposta: { type: "string" },
  },
  required: ["categoria", "confianca", "precisa_humano", "resposta"],
  additionalProperties: false,
};

// Pede a decisão à IA. Saída estruturada (JSON garantido pelo schema): antes o
// JSON vinha em texto livre e, quando quebrava, o cliente recebia o "pode me
// contar com mais detalhes?" mesmo tendo feito uma pergunta clara.
// Lança em falha da API (quem chama decide se tenta de novo na próxima rodada).
export async function decidirResposta(
  client: Anthropic,
  {
    system,
    contexto,
    lojaId,
    marketplace,
  }: { system: string; contexto: string; lojaId: string; marketplace: string }
): Promise<Decisao | null> {
  const pedido = {
    model: MODELO,
    max_tokens: 1024,
    // system (fixo por loja: instruções + exemplos) marcado para CACHE de prompt.
    system: [{ type: "text" as const, text: system, cache_control: { type: "ephemeral" as const } }],
    messages: [{ role: "user" as const, content: contexto }],
  };

  let r: Anthropic.Message;
  try {
    r = await client.messages.create({
      ...pedido,
      output_config: { format: { type: "json_schema", schema: ESQUEMA_DECISAO } },
    });
  } catch (e) {
    // Se a API recusar o formato estruturado, o robô não pode parar por isso:
    // cai pro JSON em texto livre (como era antes).
    if (!(e instanceof Anthropic.BadRequestError)) throw e;
    r = await client.messages.create({
      ...pedido,
      messages: [
        {
          role: "user",
          content: `${contexto}\n\nResponda APENAS com um JSON válido, sem nenhum texto fora dele: {"categoria":"...","confianca":"alta|baixa","precisa_humano":true|false,"resposta":"..."}`,
        },
      ],
    });
  }
  // Mede o consumo (base de cobrança por conta). Best-effort.
  await registrarUsoIA({ lojaId, tipo: "chat", modelo: MODELO, marketplace, usage: r.usage });

  if (r.stop_reason === "refusal" || r.stop_reason === "max_tokens") return null;
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

// Cliente cobrando um caso que já está com a equipe: ele recebe resposta toda
// vez (nenhuma mensagem fica no vácuo), mas nunca o mesmo texto duas vezes.
const MSGS_ACOMPANHANDO = [
  "Seu caso já está com a nossa equipe, tá? Assim que a gente tiver a resposta, te chamamos por aqui mesmo 🙏",
  "Estamos acompanhando seu caso por aqui. Assim que a equipe concluir a análise, a resposta chega neste chat 🙏",
  "Não esquecemos de você! Seu caso segue com a equipe e a resposta vem por aqui mesmo 🙏",
];

// Cliente mandou anexo de novo depois de já termos pedido detalhes.
const MSGS_ANEXO = [
  "Recebi o que você enviou! Vou pedir pra alguém da nossa equipe olhar e te respondemos por aqui 🙏",
  "Recebido! Alguém da nossa equipe vai olhar o que você mandou e te responde por aqui 🙏",
];

// A IA repetiu exatamente o que a loja acabou de dizer (cliente só disse "ok").
const MSGS_ENCERRAMENTO = [
  "Estou por aqui! Se precisar de mais alguma coisa, é só chamar 😊",
  "Qualquer coisa é só falar por aqui, tá? 😊",
];

const diferenteDaUltima = (opcoes: string[], ultima: string) =>
  opcoes.find((o) => o !== ultima.trim()) ?? opcoes[0];

// Textos prontos do sistema não podem virar "exemplo de como a loja responde"
// no prompt — senão a IA passa a usá-los em respostas normais.
const PRONTAS = new Set([
  MSG_ESPERA_PADRAO,
  MSG_PEDIR_DETALHES,
  ...MSGS_ACOMPANHANDO,
  ...MSGS_ANEXO,
  ...MSGS_ENCERRAMENTO,
]);

export function ehMensagemPronta(texto: string | null | undefined) {
  return PRONTAS.has((texto || "").trim());
}

export type Acao =
  // resposta que resolve: envia e encerra
  | { tipo: "responder"; texto: string }
  // caso precisa de gente: envia um aviso ao cliente E chama você
  | { tipo: "espera"; texto: string }
  // chama você sem enviar nada — só existe no modo NÃO-autônomo (você aprova)
  | { tipo: "humano" };

// Decide o que fazer com a resposta da IA.
export function decidirAcao({
  decisao,
  autonomo,
  temTextoCliente,
  bloqueadaPorContato,
  jaAguardandoHumano,
  ultimaMsgLoja,
}: {
  decisao: Decisao | null;
  autonomo: boolean;
  temTextoCliente: boolean;
  bloqueadaPorContato: boolean;
  jaAguardandoHumano: boolean;
  ultimaMsgLoja: string;
}): Acao {
  const resposta = (decisao?.resposta || "").trim();
  const repetida = (txt: string) => !!txt && ultimaMsgLoja.trim() === txt;
  // No autônomo TODA mensagem do cliente recebe resposta: quando o robô não
  // tem o que dizer, manda um aviso (sempre diferente do anterior) e chama você.
  const avisoEspera = (): Acao => ({
    tipo: "espera",
    texto: diferenteDaUltima(
      jaAguardandoHumano ? MSGS_ACOMPANHANDO : [MSG_ESPERA_PADRAO, ...MSGS_ACOMPANHANDO],
      ultimaMsgLoja
    ),
  });

  if (bloqueadaPorContato) return autonomo ? avisoEspera() : { tipo: "humano" };

  if (!temTextoCliente) {
    if (!autonomo) return { tipo: "humano" };
    // Só anexo/imagem: pergunta do que se trata; se já perguntou, chama você.
    if (!repetida(MSG_PEDIR_DETALHES)) return { tipo: "responder", texto: MSG_PEDIR_DETALHES };
    return { tipo: "espera", texto: diferenteDaUltima(MSGS_ANEXO, ultimaMsgLoja) };
  }

  // A IA marca precisa_humano também quando só falta um dado do cliente; se a
  // resposta já é a pergunta pedindo esse dado, a conversa segue sem chamar você.
  const soPedeDado =
    !!resposta && terminaEmPergunta(resposta) && !RE_PROMESSA.test(resposta);
  const precisaHumano =
    !decisao ||
    (decisao.precisa_humano === true && !soPedeDado) ||
    contemPromessaRetorno(resposta);

  if (!autonomo) {
    if (precisaHumano || decisao?.confianca === "baixa" || !resposta) return { tipo: "humano" };
    return repetida(resposta) ? { tipo: "humano" } : { tipo: "responder", texto: resposta };
  }

  if (!precisaHumano && resposta) {
    // Anti-papagaio: nunca manda de novo o texto que a loja acabou de enviar.
    return {
      tipo: "responder",
      texto: repetida(resposta) ? diferenteDaUltima(MSGS_ENCERRAMENTO, ultimaMsgLoja) : resposta,
    };
  }

  // Precisa de gente. O cliente sempre recebe resposta; o que muda é o texto:
  // se ele já foi avisado (ou a IA falhou/repetiu), vai um aviso de
  // acompanhamento em vez da mesma promessa de novo.
  if (!decisao || !resposta || repetida(resposta)) return avisoEspera();
  if (jaAguardandoHumano && contemPromessaRetorno(resposta)) return avisoEspera();
  return { tipo: "espera", texto: resposta };
}

export const PREFIXO_AGUARDANDO = "aguardando_humano";

export function estaAguardandoHumano(c: {
  escalada?: boolean | null;
  motivo_escala?: string | null;
}) {
  return !!c.escalada && (c.motivo_escala || "").startsWith(PREFIXO_AGUARDANDO);
}

// Re-aviso no Telegram quando o cliente cobra de novo: no máximo 1 a cada 30 min
// por conversa (cliente mandando "?", "??", "alô" em sequência).
export function podeReavisar(escaladaEm: string | null | undefined) {
  if (!escaladaEm) return true;
  return Date.now() - new Date(escaladaEm).getTime() > 30 * 60 * 1000;
}
