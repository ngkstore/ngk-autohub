import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { escopoDoUsuario } from "@/lib/conta";
import { lojasShopeeDoEscopo } from "@/lib/shopee/lojas";
import { sincronizarChatsPagina } from "@/lib/shopee/sincronizarChats";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Roda a sincronização do chat AO VIVO (só as conversas novas) e mostra o
// resultado/erro — p/ saber por que as mensagens novas não estão entrando.
export async function GET() {
  const escopo = await escopoDoUsuario();
  const lojas = await lojasShopeeDoEscopo(escopo);

  const resultados = [];
  for (const loja of lojas) {
    try {
      const r = await sincronizarChatsPagina({ loja, direction: "latest" });
      resultados.push({ shop_id: loja.shopId, ...r });
    } catch (e) {
      resultados.push({
        shop_id: loja.shopId,
        erro: e instanceof Error ? e.message : "erro desconhecido",
      });
    }
  }

  // Quando foi a última mensagem que entrou no banco?
  const { data: ultimaMsg } = await supabase
    .from("chat_mensagens")
    .select("created_timestamp, texto, de_loja")
    .order("created_timestamp", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: ultimaConversa } = await supabase
    .from("chat_conversas")
    .select("atualizado_em, ultima_mensagem_ts, to_name")
    .order("atualizado_em", { ascending: false })
    .limit(1)
    .maybeSingle();

  const ultimoTs = ultimaMsg?.created_timestamp
    ? new Date(Number(ultimaMsg.created_timestamp) * 1000).toISOString()
    : "nenhuma";

  return NextResponse.json({
    sucesso: true,
    sync_ao_vivo: resultados,
    ultima_mensagem_no_banco: ultimoTs,
    ultima_conversa_atualizada: ultimaConversa?.atualizado_em ?? "nenhuma",
    leitura:
      "Se sync_ao_vivo traz erro -> e a causa (ex.: get_conversation_list error/token). " +
      "Se roda sem erro mas conversas=0 e ultima_mensagem_no_banco for de horas atras -> a Shopee nao esta devolvendo mensagens novas (pode ser mudanca na API do sellerchat).",
  });
}
