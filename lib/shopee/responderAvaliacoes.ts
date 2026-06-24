import crypto from "crypto";
import Anthropic from "@anthropic-ai/sdk";
import { supabase } from "@/lib/supabase";

const BASE_URL_PADRAO = "https://partner.shopeemobile.com";

// Modelos prontos para avaliações 5★ (rodízio, para não parecer robô/spam).
const MODELOS_5_ESTRELAS = [
  "Muito obrigado pela avaliação! Ficamos felizes que tenha gostado. Conte sempre com a NGK Store. 💖",
  "Que alegria receber seu feedback! Agradecemos a confiança e esperamos te atender de novo em breve. 🧡",
  "Obrigado pela nota máxima! Seu apoio faz toda a diferença pra gente. Volte sempre! ✨",
  "Ficamos muito felizes com sua avaliação! Obrigado por escolher a NGK Store. 🙌",
  "Agradecemos demais pelo carinho! É ótimo saber que você gostou da sua compra. 💫",
  "Obrigado por compartilhar sua experiência! Contamos com você nas próximas compras. 😊",
  "Que bom que você gostou! Muito obrigado pela avaliação e pela confiança na NGK Store. 💚",
  "Seu feedback nos deixa muito felizes! Obrigado e até a próxima compra. 🛍️",
];

function modelo5Estrelas(commentId: number) {
  const idx = Math.abs(commentId) % MODELOS_5_ESTRELAS.length;
  return MODELOS_5_ESTRELAS[idx];
}

const PROMPT_NEGATIVA = `Você responde avaliações de clientes da NGK Store (loja na Shopee) em português do Brasil.
Esta é uma avaliação NEGATIVA. Escreva uma resposta curta (2-4 frases), empática e profissional:
- Lamente sinceramente que a experiência não foi boa, sem ser robótico.
- Assuma a responsabilidade e mostre vontade de resolver.
- Oriente o cliente a abrir uma solicitação de devolução/reembolso pelo próprio app da Shopee, ou a entrar em contato pelo chat da loja, para que a equipe resolva.
- Tom acolhedor e humano. Pode usar no máximo 1 emoji discreto.
Responda APENAS com o texto da resposta ao cliente, sem aspas e sem rótulos.`;

const PROMPT_NEUTRA = `Você responde avaliações de clientes da NGK Store (loja na Shopee) em português do Brasil.
Esta avaliação é mediana/positiva. Escreva uma resposta curta (1-3 frases):
- Agradeça pelo feedback.
- Reconheça brevemente o ponto levantado, se houver comentário.
- Convide o cliente a comprar novamente.
- Tom acolhedor. Pode usar no máximo 1 emoji discreto.
Responda APENAS com o texto da resposta ao cliente, sem aspas e sem rótulos.`;

type AvaliacaoRow = {
  id: string;
  comment_id: number;
  avaliacao: number | null;
  comentario: string | null;
  nome_produto: string | null;
};

type TokenLoja = { accessToken: string; shopId: string; lojaId: string | null };

async function obterToken(): Promise<TokenLoja> {
  const { data: token } = await supabase
    .from("marketplace_tokens")
    .select("access_token, shop_id, loja_id")
    .eq("marketplace", "shopee")
    .eq("status", "ativo")
    .limit(1)
    .single();

  if (!token?.access_token || !token?.shop_id) {
    throw new Error("Nenhuma loja Shopee com token ativo.");
  }
  return {
    accessToken: token.access_token,
    shopId: String(token.shop_id),
    lojaId: token.loja_id ?? null,
  };
}

async function gerarRespostaIA(client: Anthropic, avaliacao: AvaliacaoRow) {
  const negativa = (avaliacao.avaliacao ?? 5) <= 2;
  const system = negativa ? PROMPT_NEGATIVA : PROMPT_NEUTRA;

  const conteudo =
    `Produto: ${avaliacao.nome_produto || "produto da loja"}\n` +
    `Nota: ${avaliacao.avaliacao ?? "?"} estrela(s)\n` +
    `Comentário do cliente: ${avaliacao.comentario?.trim() || "(sem texto, apenas a nota)"}`;

  const resposta = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 300,
    system,
    messages: [{ role: "user", content: conteudo }],
  });

  const texto = resposta.content.find((b) => b.type === "text");
  return texto && "text" in texto ? texto.text.trim() : "";
}

// Publica respostas na Shopee em lote (reply_comment aceita várias por chamada).
async function publicarRespostas(
  token: TokenLoja,
  lista: { comment_id: number; comment: string }[]
) {
  const partnerId = process.env.SHOPEE_PARTNER_ID!;
  const partnerKey = process.env.SHOPEE_PARTNER_KEY!;
  const baseUrl = process.env.SHOPEE_API_BASE_URL || BASE_URL_PADRAO;
  const path = "/api/v2/product/reply_comment";
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
    body: JSON.stringify({ comment_list: lista }),
  });

  const data = await response.json();

  if (!response.ok || data.error) {
    throw new Error(
      `Erro Shopee reply_comment: ${data?.error || "-"} | ${data?.message || "-"}`
    );
  }

  return data;
}

export type ResultadoResponder = {
  processados: number;
  publicados: number;
  comModelo: number;
  comIA: number;
  restantes: number;
  erro?: string;
};

// Processa um lote de avaliações pendentes: gera a resposta (modelo p/ 5★,
// IA Haiku p/ 1-4★), publica na Shopee e marca como respondida.
export async function responderAvaliacoesLote({
  limite = 20,
  notaMax,
}: { limite?: number; notaMax?: number } = {}): Promise<ResultadoResponder> {
  let query = supabase
    .from("avaliacoes")
    .select("id, comment_id, avaliacao, comentario, nome_produto")
    .eq("marketplace", "shopee")
    .eq("ja_respondida", false)
    .not("comment_id", "is", null);

  // Permite testar/priorizar só as avaliações ruins (ex.: notaMax = 2).
  if (typeof notaMax === "number") {
    query = query.lte("avaliacao", notaMax);
  }

  const { data: pendentes } = await query
    .order("data_avaliacao", { ascending: false })
    .limit(limite);

  if (!pendentes || pendentes.length === 0) {
    return {
      processados: 0,
      publicados: 0,
      comModelo: 0,
      comIA: 0,
      restantes: 0,
    };
  }

  const token = await obterToken();
  const client = new Anthropic(); // lê ANTHROPIC_API_KEY do ambiente

  const aPublicar: { comment_id: number; comment: string; id: string }[] = [];
  let comModelo = 0;
  let comIA = 0;

  for (const a of pendentes as AvaliacaoRow[]) {
    try {
      let texto: string;
      if ((a.avaliacao ?? 5) >= 5) {
        texto = modelo5Estrelas(a.comment_id);
        comModelo++;
      } else {
        texto = await gerarRespostaIA(client, a);
        comIA++;
      }
      if (texto) {
        aPublicar.push({ comment_id: a.comment_id, comment: texto, id: a.id });
      }
    } catch {
      // pula esta avaliação; continua o lote (fica pendente p/ próxima rodada)
    }
  }

  if (aPublicar.length === 0) {
    return {
      processados: pendentes.length,
      publicados: 0,
      comModelo,
      comIA,
      restantes: 0,
      erro: "Nenhuma resposta gerada (verifique a ANTHROPIC_API_KEY/créditos).",
    };
  }

  await publicarRespostas(
    token,
    aPublicar.map(({ comment_id, comment }) => ({ comment_id, comment }))
  );

  // Marca como respondidas (crítico — não inclui respondida_em, que pode não
  // existir ainda; assim a marcação nunca falha e evita resposta duplicada).
  const agoraIso = new Date().toISOString();
  for (const item of aPublicar) {
    await supabase
      .from("avaliacoes")
      .update({
        ja_respondida: true,
        status: "respondida",
        resposta_shopee: item.comment,
      })
      .eq("id", item.id);
  }

  // Carimbo de horário — best-effort (ignora erro se a coluna ainda não existe).
  await supabase
    .from("avaliacoes")
    .update({ respondida_em: agoraIso })
    .in(
      "id",
      aPublicar.map((i) => i.id)
    );

  // Registra a rodada no histórico (para acompanhar o ritmo).
  await supabase.from("sincronizacoes").insert({
    loja_id: token.lojaId,
    marketplace: "shopee",
    tipo: "avaliacoes-resposta",
    status: "sucesso",
    registros_importados: aPublicar.length,
    mensagem: `${aPublicar.length} resposta(s) publicada(s) (modelo: ${comModelo} • IA: ${comIA}).`,
    iniciado_em: agoraIso,
    finalizado_em: new Date().toISOString(),
  });

  const { count } = await supabase
    .from("avaliacoes")
    .select("id", { count: "exact", head: true })
    .eq("marketplace", "shopee")
    .eq("ja_respondida", false)
    .not("comment_id", "is", null);

  return {
    processados: pendentes.length,
    publicados: aPublicar.length,
    comModelo,
    comIA,
    restantes: count ?? 0,
  };
}
