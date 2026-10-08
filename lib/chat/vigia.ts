import { supabase } from "@/lib/supabase";
import { enviarTelegram } from "@/lib/telegram";

// Vigia do chat: o robô pode parar por vários motivos (token, crédito da IA,
// API da plataforma, erro de gravação) e, sem alarme, só se descobre quando os
// clientes já estão há horas sem resposta. Aqui o próprio cron confere o
// RESULTADO — fila envelhecendo e sync sem rodar — e avisa no Telegram.

type Marketplace = "shopee" | "tiktok_shop";

const NOME: Record<Marketplace, string> = { shopee: "Shopee", tiktok_shop: "TikTok Shop" };

const MIN_FILA = 20; // conversa nova esperando o robô há mais que isso = fila parada
const MIN_SYNC = 15; // sync roda a cada 2 min; mais que isso sem sucesso = parado
const MIN_ENTRE_ALERTAS = 60;

async function lerConfig(chave: string) {
  const { data } = await supabase
    .from("configuracoes")
    .select("valor")
    .eq("chave", chave)
    .maybeSingle();
  return (data?.valor as string | undefined) ?? null;
}

async function gravarConfig(chave: string, valor: string) {
  const linha = { chave, valor, atualizado_em: new Date().toISOString() };
  const { data } = await supabase
    .from("configuracoes")
    .select("chave")
    .eq("chave", chave)
    .maybeSingle();
  if (data) await supabase.from("configuracoes").update(linha).eq("chave", chave);
  else await supabase.from("configuracoes").insert(linha);
}

const chaveSync = (mkt: Marketplace, lojaId: string) => `chat_sync_ok:${mkt}:${lojaId}`;

// Chamado pelo sync de cada loja quando ele termina sem erro.
export async function registrarSyncOk(mkt: Marketplace, lojaId: string) {
  await gravarConfig(chaveSync(mkt, lojaId), new Date().toISOString());
}

async function alertar(mkt: Marketplace, tipo: string, texto: string) {
  const chave = `chat_alerta:${mkt}:${tipo}`;
  const ultimo = await lerConfig(chave);
  if (ultimo && Date.now() - new Date(ultimo).getTime() < MIN_ENTRE_ALERTAS * 60_000) return false;
  await gravarConfig(chave, new Date().toISOString());
  await enviarTelegram(texto);
  return true;
}

// Roda no fim do cron do robô, só para as lojas com o robô ligado.
export async function vigiarChat(mkt: Marketplace, lojaIds: string[], erroDaRodada?: string) {
  if (lojaIds.length === 0) return { filaParada: 0, syncParado: 0 };
  const agora = Date.now();

  // 1) Fila parada: cliente esperando e o robô ainda não tratou (nem escalou).
  const ns = (ms: number) => ms * 1_000_000; // ultima_mensagem_ts é em nanossegundos
  const { data: pend } = await supabase
    .from("chat_conversas")
    .select("conversation_id, latest_message_id, cliente_msg_id, ultimo_tratado_msg_id")
    .eq("marketplace", mkt)
    .in("loja_id", lojaIds)
    .eq("precisa_resposta", true)
    .lt("ultima_mensagem_ts", ns(agora - MIN_FILA * 60_000))
    .gt("ultima_mensagem_ts", ns(agora - 24 * 3600_000))
    .limit(200);
  const filaParada = (pend || []).filter(
    (c) => (c.ultimo_tratado_msg_id || "") !== (c.cliente_msg_id || c.latest_message_id || "")
  ).length;

  if (filaParada > 0) {
    await alertar(
      mkt,
      "fila",
      `🚨 Robô de chat ${NOME[mkt]} parado\n\n` +
        `${filaParada} cliente(s) esperando resposta há mais de ${MIN_FILA} min e o robô não tratou.\n` +
        (erroDaRodada ? `Último erro: ${erroDaRodada.slice(0, 250)}\n` : "") +
        `Responda pelo Seller Center enquanto isso.`
    );
  }

  // 2) Sync parado: sem conversas novas chegando, o robô fica "cego" e a fila
  //    parece vazia — por isso é um alarme separado.
  const { data: batidas } = await supabase
    .from("configuracoes")
    .select("chave, valor")
    .in("chave", lojaIds.map((id) => chaveSync(mkt, id)));
  const ultima = new Map((batidas || []).map((b) => [b.chave as string, b.valor as string]));
  const paradas = lojaIds.filter((id) => {
    const v = ultima.get(chaveSync(mkt, id));
    return !!v && agora - new Date(v).getTime() > MIN_SYNC * 60_000; // sem registro = sync ainda não rodou
  });

  if (paradas.length > 0) {
    await alertar(
      mkt,
      "sync",
      `🚨 Sync do chat ${NOME[mkt]} parado\n\n` +
        `${paradas.length} loja(s) sem sincronizar conversas há mais de ${MIN_SYNC} min — o robô não enxerga mensagens novas.\n` +
        `Confira o token da loja e o cron /api/${mkt === "shopee" ? "shopee" : "tiktok"}/chat/sincronizar.`
    );
  }

  // 3) Lembrete diário do que espera uma PESSOA: o robô já respondeu e marcou
  //    o caso, mas ninguém resolveu. Sem isso o caso só existe no Telegram do
  //    momento e some (eram 240 na fila sem ninguém saber).
  const { count: esperandoHumano } = await supabase
    .from("chat_conversas")
    .select("conversation_id", { count: "exact", head: true })
    .eq("marketplace", mkt)
    .in("loja_id", lojaIds)
    .eq("escalada", true)
    .lt("escalada_em", new Date(agora - 24 * 3600_000).toISOString());
  if ((esperandoHumano ?? 0) > 0) {
    const chave = `chat_alerta:${mkt}:humano`;
    const ultimo = await lerConfig(chave);
    if (!ultimo || agora - new Date(ultimo).getTime() > 24 * 3600_000) {
      await gravarConfig(chave, new Date().toISOString());
      await enviarTelegram(
        `📋 ${NOME[mkt]}: ${esperandoHumano} conversa(s) esperam uma pessoa há mais de 24h.\n` +
          `O robô já respondeu e avisou o cliente que alguém da equipe ia olhar. Resolva em /atendimento ou no Seller Center.`
      );
    }
  }

  return { filaParada, syncParado: paradas.length, esperandoHumano: esperandoHumano ?? 0 };
}
