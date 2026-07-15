import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { supabase } from "@/lib/supabase";

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
    const searchParams = request.nextUrl.searchParams;

    const code = searchParams.get("code");
    const shopId = searchParams.get("shop_id");

    if (!code || !shopId) {
      return NextResponse.json(
        {
          sucesso: false,
          erro: "Code ou Shop ID não recebido pela Shopee.",
        },
        { status: 400 }
      );
    }

    const partnerId = process.env.SHOPEE_PARTNER_ID;
    const partnerKey = process.env.SHOPEE_PARTNER_KEY;
    const baseUrl =
      process.env.SHOPEE_API_BASE_URL || "https://partner.shopeemobile.com";

    if (!partnerId || !partnerKey) {
      return NextResponse.json(
        {
          sucesso: false,
          erro: "Credenciais Shopee não configuradas.",
        },
        { status: 500 }
      );
    }

    const shopIdStr = String(shopId);

    // A qual loja pertence este token? Resolve nesta ordem:
    // 1) ?loja=<id> repassado pelo fluxo de autorização;
    // 2) loja pendente salva no banco ao iniciar o fluxo (reconexão);
    // 3) loja já marcada com este shop_id;
    // 4) token existente com este shop_id (reconexão);
    // 5) loja NOVA: cria sob a conta de quem iniciou a conexão;
    // 6) legado: a loja com "NGK" no apelido.
    let lojaId: string | null = searchParams.get("loja") || null;
    let usouPendente = false;

    if (!lojaId) {
      const { data } = await supabase
        .from("configuracoes")
        .select("valor")
        .eq("chave", "oauth_loja_pendente")
        .maybeSingle();
      lojaId = data?.valor || null;
      usouPendente = !!lojaId;
    }

    if (!lojaId) {
      const { data } = await supabase
        .from("lojas")
        .select("id")
        .eq("shop_id", shopIdStr)
        .maybeSingle();
      lojaId = data?.id ?? null;
    }

    if (!lojaId) {
      const { data } = await supabase
        .from("marketplace_tokens")
        .select("loja_id")
        .eq("shop_id", shopIdStr)
        .maybeSingle();
      lojaId = data?.loja_id ?? null;
    }

    // Loja NOVA (amigo conectando a Shopee dele): cria sob a conta pendente.
    if (!lojaId) {
      const { data: contaPend } = await supabase
        .from("configuracoes")
        .select("valor")
        .eq("chave", "oauth_conta_pendente")
        .maybeSingle();
      const contaId = contaPend?.valor || null;
      if (contaId) {
        const { data: nova } = await supabase
          .from("lojas")
          .insert({
            apelido: `Loja Shopee ${shopIdStr}`,
            nome: `Loja Shopee ${shopIdStr}`,
            marketplace: "shopee",
            conta_id: contaId,
            shop_id: shopIdStr,
            status: "ativo",
          })
          .select("id")
          .single();
        lojaId = nova?.id ?? null;
      }
    }

    if (!lojaId) {
      const { data } = await supabase
        .from("lojas")
        .select("id")
        .ilike("apelido", "%NGK%")
        .ilike("marketplace", "%shopee%")
        .maybeSingle();
      lojaId = data?.id ?? null;
    }

    if (!lojaId) {
      return NextResponse.json(
        {
          sucesso: false,
          erro: "Não foi possível identificar a loja para este token. Conecte pela aba Integrações (botão da loja).",
        },
        { status: 404 }
      );
    }

    const path = "/api/v2/auth/token/get";
    const timestamp = Math.floor(Date.now() / 1000);
    const sign = gerarAssinatura(partnerId, path, timestamp, partnerKey);

    const tokenUrl = `${baseUrl}${path}?partner_id=${partnerId}&timestamp=${timestamp}&sign=${sign}`;

    const response = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        code,
        shop_id: Number(shopId),
        partner_id: Number(partnerId),
      }),
    });

    const tokenData = await response.json();

    if (!response.ok || tokenData.error) {
      return NextResponse.json(
        {
          sucesso: false,
          erro: "Erro ao trocar code por token na Shopee.",
          detalhe: tokenData,
        },
        { status: 500 }
      );
    }

    await supabase
      .from("marketplace_tokens")
      .delete()
      .eq("loja_id", lojaId);

    const { error: tokenError } = await supabase
      .from("marketplace_tokens")
      .insert({
        loja_id: lojaId,
        marketplace: "shopee",
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        shop_id: String(shopId),
        expire_in: tokenData.expire_in,
        status: "ativo",
        atualizado_em: new Date().toISOString(),
      });

    if (tokenError) {
      return NextResponse.json(
        {
          sucesso: false,
          erro: "Token recebido, mas falhou ao salvar no Supabase.",
          detalhe: tokenError.message,
          tokenData,
        },
        { status: 500 }
      );
    }

    // Marca a loja com o shop_id (permite reconexão sem depender do ?loja=).
    await supabase
      .from("lojas")
      .update({ shop_id: shopIdStr })
      .eq("id", lojaId);

    // Consumiu as pendências: limpa para não vazar para a próxima conexão.
    if (usouPendente) {
      await supabase
        .from("configuracoes")
        .update({ valor: "", atualizado_em: new Date().toISOString() })
        .eq("chave", "oauth_loja_pendente");
    }
    await supabase
      .from("configuracoes")
      .update({ valor: "", atualizado_em: new Date().toISOString() })
      .eq("chave", "oauth_conta_pendente");

    await supabase.from("sincronizacoes").insert({
      loja_id: lojaId,
      marketplace: "shopee",
      tipo: "oauth",
      status: "sucesso",
      registros_importados: 1,
      mensagem: `Loja Shopee conectada com sucesso. Shop ID: ${shopId}.`,
      iniciado_em: new Date().toISOString(),
      finalizado_em: new Date().toISOString(),
    });

    return NextResponse.redirect(
      new URL("/integracoes?shopee=conectada", request.url)
    );
  } catch (error) {
    return NextResponse.json(
      {
        sucesso: false,
        erro:
          error instanceof Error
            ? error.message
            : "Erro desconhecido no callback Shopee.",
      },
      { status: 500 }
    );
  }
}