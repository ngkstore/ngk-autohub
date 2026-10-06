import { NextResponse } from "next/server";
import crypto from "crypto";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Diagnóstico das credenciais do app de afiliados (só Bearer CRON_SECRET).
// Não expõe a chave: mostra tamanho/espaços e testa a assinatura na Shopee
// com um endpoint público (get_shops_by_partner), que só exige partner_id+key.
export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ sucesso: false }, { status: 401 });
  }
  const id = process.env.SHOPEE_AMS_PARTNER_ID ?? "";
  const key = process.env.SHOPEE_AMS_PARTNER_KEY ?? "";
  const base = process.env.SHOPEE_API_BASE_URL || "https://partner.shopeemobile.com";

  const forma = (v: string) => ({
    definida: v.length > 0,
    tamanho: v.length,
    espacos_nas_pontas: v !== v.trim(),
    quebra_de_linha: /[\r\n]/.test(v),
    so_digitos: /^\d+$/.test(v),
  });

  let teste: unknown = "não rodado";
  if (id && key) {
    const path = "/api/v2/public/get_shops_by_partner";
    const ts = Math.floor(Date.now() / 1000);
    const sign = crypto.createHmac("sha256", key.trim()).update(`${id.trim()}${path}${ts}`).digest("hex");
    const r = await fetch(
      `${base}${path}?partner_id=${id.trim()}&timestamp=${ts}&sign=${sign}&page_size=10&page_no=1`,
      { cache: "no-store" }
    );
    const txt = await r.text();
    teste = { http: r.status, resposta: txt.slice(0, 400) };
  }

  return NextResponse.json({
    sucesso: true,
    partner_id: id.trim(),
    forma_partner_id: forma(id),
    forma_partner_key: forma(key),
    teste_assinatura: teste,
    leitura:
      "error_sign no teste = Partner ID e Key não são do mesmo par (ou não é o par Live). " +
      "Se vier lista de lojas (ou error_param sem error_sign), a assinatura está certa.",
  });
}
