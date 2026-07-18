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

  function resumir(convs: Record<string, unknown>[]) {
    return convs.slice(0, 8).map((c) => {
      const tsNano = Number(c.last_message_timestamp || 0);
      const seg = tsNano > 1e14 ? Math.floor(tsNano / 1e9) : tsNano;
      return {
        cliente: c.to_name,
        ultima_msg:
          (c.latest_message_content as { text?: string })?.text?.slice(0, 35) ??
          "(sem texto)",
        quem_falou:
          String(c.latest_message_from_id) === String(c.to_id) ? "CLIENTE" : "loja",
        horario_brt: seg
          ? new Date(seg * 1000).toLocaleString("pt-BR", {
              timeZone: "America/Sao_Paulo",
            })
          : "?",
        unread: c.unread_count,
      };
    });
  }

  async function chamar(params: Record<string, string>, loja: (typeof lojas)[number]) {
    const ts = Math.floor(Date.now() / 1000);
    const sign = crypto
      .createHmac("sha256", partnerKey)
      .update(`${partnerId}${path}${ts}${loja.accessToken}${loja.shopId}`)
      .digest("hex");
    const u = new URL(`${BASE}${path}`);
    u.searchParams.set("partner_id", partnerId);
    u.searchParams.set("timestamp", String(ts));
    u.searchParams.set("access_token", loja.accessToken);
    u.searchParams.set("shop_id", loja.shopId);
    u.searchParams.set("sign", sign);
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
    const resp = await fetch(u.toString(), { cache: "no-store" });
    const data = await resp.json();
    return {
      erro: data?.error ? `${data.error} | ${data.message}` : null,
      qtd: (data?.response?.conversations || []).length,
      conversas: resumir(data?.response?.conversations || []),
    };
  }

  const agoraNano = String(Date.now() * 1_000_000);
  const saida = [];
  for (const loja of lojas) {
    saida.push({
      shop_id: loja.shopId,
      A_latest_semTs: await chamar(
        { type: "all", direction: "latest", page_size: "8" },
        loja
      ),
      B_older_comTsAgora: await chamar(
        { type: "all", direction: "older", next_timestamp: agoraNano, page_size: "8" },
        loja
      ),
      C_unread: await chamar(
        { type: "unread", direction: "latest", page_size: "8" },
        loja
      ),
    });
  }

  return NextResponse.json({
    sucesso: true,
    agora_brt: new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }),
    lojas: saida,
    leitura:
      "Qual das 3 (A/B/C) traz as conversas de HOJE com os clientes esperando? " +
      "A = como fazemos hoje (direction=latest). B = older + next_timestamp=agora. " +
      "C = so nao-lidas. A que trouxer as novas vira o novo jeito de sincronizar.",
  });
}
