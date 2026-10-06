import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { supabase } from "@/lib/supabase";
import { escopoDoUsuario } from "@/lib/conta";
import { urlAutorizacaoAms } from "@/lib/shopee/ams";

const CHAVE_LOJA_PENDENTE = "oauth_loja_pendente";
const CHAVE_CONTA_PENDENTE = "oauth_conta_pendente";

async function salvarConfig(chave: string, valor: string) {
  const { data } = await supabase
    .from("configuracoes")
    .select("chave")
    .eq("chave", chave)
    .maybeSingle();
  const linha = { chave, valor, atualizado_em: new Date().toISOString() };
  if (data) {
    await supabase.from("configuracoes").update(linha).eq("chave", chave);
  } else {
    await supabase.from("configuracoes").insert(linha);
  }
}

function gerarAssinatura(
  partnerId: string,
  path: string,
  timestamp: number,
  partnerKey: string
) {
  const baseString = `${partnerId}${path}${timestamp}`;

  return crypto
    .createHmac("sha256", partnerKey)
    .update(baseString)
    .digest("hex");
}

export async function GET(request: NextRequest) {
  try {
    const partnerId = process.env.SHOPEE_PARTNER_ID;
    const partnerKey = process.env.SHOPEE_PARTNER_KEY;
    const redirectUrl = process.env.NEXT_PUBLIC_SHOPEE_REDIRECT_URL;

    // Qual loja estamos conectando? Vem de /api/shopee/auth?loja=<id>.
    // Repassamos no redirect para o callback amarrar o token à loja certa.
    const lojaId = request.nextUrl.searchParams.get("loja");

    // ?app=afiliados: autoriza o SEGUNDO app (só módulo de Afiliados) numa loja
    // já cadastrada. O callback recebe ?app=afiliados&loja=<id> e guarda o
    // token em shopee_ams_tokens, sem tocar no token principal.
    if (request.nextUrl.searchParams.get("app") === "afiliados") {
      if (!lojaId || !redirectUrl) {
        return NextResponse.json(
          { sucesso: false, erro: "Informe a loja (?loja=) para conectar o app de afiliados." },
          { status: 400 }
        );
      }
      const u = new URL(redirectUrl);
      u.searchParams.set("app", "afiliados");
      u.searchParams.set("loja", lojaId);
      return NextResponse.redirect(urlAutorizacaoAms(u.toString()));
    }

    if (!partnerId || !partnerKey || !redirectUrl) {
      return NextResponse.json(
        {
          sucesso: false,
          erro: "Credenciais Shopee não configuradas na Vercel.",
          debug: {
            temPartnerId: !!partnerId,
            temPartnerKey: !!partnerKey,
            temRedirectUrl: !!redirectUrl,
          },
        },
        { status: 400 }
      );
    }

    const path = "/api/v2/shop/auth_partner";
    const timestamp = Math.floor(Date.now() / 1000);
    const sign = gerarAssinatura(partnerId, path, timestamp, partnerKey);

    const baseUrl =
      process.env.SHOPEE_API_BASE_URL || "https://partner.shopeemobile.com";

    // Guarda a conta de quem está conectando (para o callback criar a loja nova
    // sob a conta certa) e, se for reconexão, a loja pendente.
    const escopo = await escopoDoUsuario();
    await salvarConfig(CHAVE_CONTA_PENDENTE, escopo.contaId || "");

    let redirect = redirectUrl;
    if (lojaId) {
      await salvarConfig(CHAVE_LOJA_PENDENTE, lojaId);
      const u = new URL(redirectUrl);
      u.searchParams.set("loja", lojaId);
      redirect = u.toString();
    } else {
      // Conexão de loja NOVA: limpa a loja pendente antiga.
      await salvarConfig(CHAVE_LOJA_PENDENTE, "");
    }

    const authUrl = new URL(`${baseUrl}${path}`);

    authUrl.searchParams.set("partner_id", partnerId);
    authUrl.searchParams.set("timestamp", String(timestamp));
    authUrl.searchParams.set("sign", sign);
    authUrl.searchParams.set("redirect", redirect);

    return NextResponse.redirect(authUrl.toString());
  } catch (error) {
    return NextResponse.json(
      {
        sucesso: false,
        erro:
          error instanceof Error
            ? error.message
            : "Erro desconhecido ao gerar autorização Shopee.",
      },
      { status: 500 }
    );
  }
}