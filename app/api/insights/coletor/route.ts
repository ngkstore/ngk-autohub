import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Recebe as capturas da extensão. Autentica por segredo (COLETOR_SECRET),
// porque quem chama é a extensão, não um usuário logado.
// A loja é resolvida pelo shop_id que vem nas respostas da Shopee.

// Procura shop_id em qualquer nível do JSON.
function acharShopId(v: unknown, nivel = 0): string | null {
  if (!v || nivel > 6) return null;
  if (Array.isArray(v)) {
    for (const item of v) {
      const r = acharShopId(item, nivel + 1);
      if (r) return r;
    }
    return null;
  }
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    for (const [k, val] of Object.entries(o)) {
      if (k === "shop_id" && (typeof val === "number" || typeof val === "string")) {
        const s = String(val);
        if (/^\d{3,}$/.test(s)) return s;
      }
      const r = acharShopId(val, nivel + 1);
      if (r) return r;
    }
  }
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const segredo = process.env.COLETOR_SECRET;
    if (!segredo) {
      return NextResponse.json(
        { sucesso: false, erro: "COLETOR_SECRET não configurado na Vercel." },
        { status: 500 }
      );
    }
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${segredo}`) {
      return NextResponse.json({ sucesso: false, erro: "não autorizado" }, { status: 401 });
    }

    const body = await request.json();
    const capturas: { url?: string; metodo?: string; data?: unknown }[] =
      Array.isArray(body?.capturas) ? body.capturas : [];

    if (capturas.length === 0) {
      return NextResponse.json({ sucesso: true, guardadas: 0 });
    }

    // Todas as lojas (p/ resolver por shop_id ou pelo loja_id da config).
    const { data: lojas } = await supabase
      .from("lojas")
      .select("id, shop_id, conta_id");
    const porShop = new Map(
      (lojas || [])
        .filter((l) => l.shop_id)
        .map((l) => [String(l.shop_id), l])
    );
    const porId = new Map((lojas || []).map((l) => [String(l.id), l]));

    // Loja informada pela extensão (config.js) — fallback confiável.
    const lojaConfig = body?.loja_id ? porId.get(String(body.loja_id)) : undefined;

    const linhas = capturas.slice(0, 200).map((c) => {
      const shopId = acharShopId(c.data) || String(body?.shop_id || "") || null;
      const loja = (shopId ? porShop.get(shopId) : undefined) || lojaConfig;
      return {
        conta_id: loja?.conta_id ?? null,
        loja_id: loja?.id ?? null,
        shop_id: shopId ?? (loja?.shop_id ? String(loja.shop_id) : null),
        url: String(c.url || "").slice(0, 500),
        metodo: String(c.metodo || "GET"),
        payload: c.data ?? null,
      };
    });

    const { error } = await supabase.from("coletor_capturas").insert(linhas);
    if (error) {
      return NextResponse.json({ sucesso: false, erro: error.message }, { status: 500 });
    }

    return NextResponse.json({
      sucesso: true,
      guardadas: linhas.length,
      lojas_reconhecidas: linhas.filter((l) => l.loja_id).length,
    });
  } catch (error) {
    return NextResponse.json(
      { sucesso: false, erro: error instanceof Error ? error.message : "Erro." },
      { status: 500 }
    );
  }
}
