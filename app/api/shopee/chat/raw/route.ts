import { NextResponse } from "next/server";
import crypto from "crypto";
import { escopoDoUsuario } from "@/lib/conta";
import { lojasShopeeDoEscopo } from "@/lib/shopee/lojas";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BASE = process.env.SHOPEE_API_BASE_URL || "https://partner.shopeemobile.com";

// Dump CRU do get_conversation_list (direction=latest): mostra o que a Shopee
// REALMENTE devolve — pra saber se as conversas novas (que aparecem no app)
// chegam ou não na API do sellerchat.
export async function GET() {
  const partnerId = process.env.SHOPEE_PARTNER_ID!;
  const partnerKey = process.env.SHOPEE_PARTNER_KEY!;
  const escopo = await escopoDoUsuario();
  const lojas = await lojasShopeeDoEscopo(escopo);
  const path = "/api/v2/sellerchat/get_conversation_list";

  const saida = [];
  for (const loja of lojas) {
    const ts = Math.floor(Date.now() / 1000);
    const sign = crypto
      .createHmac("sha256", partnerKey)
      .update(`${partnerId}${path}${ts}${loja.accessToken}${loja.shopId}`)
      .digest("hex");
    const url =
      `${BASE}${path}?partner_id=${partnerId}&timestamp=${ts}` +
      `&access_token=${encodeURIComponent(loja.accessToken)}&shop_id=${loja.shopId}&sign=${sign}` +
      `&type=all&direction=latest&page_size=15`;

    const resp = await fetch(url, { cache: "no-store" });
    const data = await resp.json();
    const convs = data?.response?.conversations || [];

    saida.push({
      shop_id: loja.shopId,
      erro: data?.error ? `${data.error} | ${data.message}` : null,
      qtd: convs.length,
      // as conversas cruas, com o horário da última mensagem (em BRT p/ comparar)
      conversas: convs.slice(0, 15).map((c: Record<string, unknown>) => {
        const tsNano = Number(c.last_message_timestamp || 0);
        const seg = tsNano > 1e14 ? Math.floor(tsNano / 1e9) : tsNano; // nano->seg
        return {
          cliente: c.to_name,
          ultima_msg:
            (c.latest_message_content as { text?: string })?.text?.slice(0, 40) ??
            "(sem texto)",
          quem_falou_por_ultimo:
            String(c.latest_message_from_id) === String(c.to_id) ? "CLIENTE" : "loja",
          horario_brt: seg
            ? new Date(seg * 1000).toLocaleString("pt-BR", {
                timeZone: "America/Sao_Paulo",
              })
            : "?",
          unread: c.unread_count,
        };
      }),
    });
  }

  return NextResponse.json({
    sucesso: true,
    agora_brt: new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }),
    lojas: saida,
    leitura:
      "Se as conversas novas (ex.: 23:19) APARECEM aqui com quem_falou=CLIENTE -> a API tem os dados e o bug e nosso (processamento). Se NAO aparecem / horario travado -> a Shopee nao esta entregando as mensagens novas na API (lado deles).",
  });
}
