import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { chamarTikTok } from "@/lib/tiktok/client";
import { garantirTokenTikTok, type LinhaTokenTikTok } from "@/lib/tiktok/token";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Sondagem genérica (somente leitura por padrão) da API do TikTok Shop na conta
// conectada — pra mapear o que o app tem permissão de usar. Protegida por CRON_SECRET.
//   GET ?path=/analytics/202405/shop/performance&method=GET&cipher=1&q={"start_date_ge":"2026-09-01"}
//   GET ?lote=[{"nome":"...","path":"...","method":"GET","cipher":true,"query":{},"body":{}}]
// `escrever=1` é obrigatório pra deixar passar POST/PUT/DELETE que alterem algo
// (por padrão POSTs só passam se o path contiver "search" ou "get").
type Alvo = {
  nome?: string;
  path: string;
  method?: "GET" | "POST" | "PUT" | "DELETE";
  cipher?: boolean;
  query?: Record<string, string>;
  body?: unknown;
};

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const { data: token } = await supabase
    .from("marketplace_tokens")
    .select("id, loja_id, access_token, refresh_token, expire_in, status, shop_cipher, shop_id")
    .eq("marketplace", "tiktok_shop")
    .in("status", ["ativo", "expirado"])
    .order("atualizado_em", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!token?.access_token) {
    return NextResponse.json({ sucesso: false, erro: "Nenhum token TikTok no banco." });
  }
  const t = await garantirTokenTikTok(token as unknown as LinhaTokenTikTok, 3600);
  if (t.erro) return NextResponse.json({ sucesso: false, erro: `token: ${t.erro}` });
  const cipher = (token.shop_cipher as string) || undefined;
  const escrever = sp.get("escrever") === "1";

  let alvos: Alvo[] = [];
  const lote = sp.get("lote");
  if (lote) {
    try { alvos = JSON.parse(lote) as Alvo[]; } catch { return NextResponse.json({ sucesso: false, erro: "lote inválido" }); }
  } else if (sp.get("path")) {
    let query: Record<string, string> | undefined;
    let body: unknown;
    try { query = sp.get("q") ? JSON.parse(sp.get("q")!) : undefined; } catch { return NextResponse.json({ sucesso: false, erro: "q inválido" }); }
    try { body = sp.get("body") ? JSON.parse(sp.get("body")!) : undefined; } catch { return NextResponse.json({ sucesso: false, erro: "body inválido" }); }
    alvos = [{ path: sp.get("path")!, method: (sp.get("method") as Alvo["method"]) || "GET", cipher: sp.get("cipher") !== "0", query, body }];
  } else {
    return NextResponse.json({ sucesso: false, erro: "informe path= ou lote=" });
  }

  const max = Number(sp.get("max") || 6000);
  const resultados = [];
  for (const a of alvos) {
    const method = a.method || "GET";
    const seguro = method === "GET" || /search|get|list|query|performance|statement|detail/i.test(a.path);
    if (!seguro && !escrever) {
      resultados.push({ nome: a.nome, path: a.path, pulado: "método de escrita; use escrever=1" });
      continue;
    }
    try {
      const r = await chamarTikTok(a.path, {
        method: method === "GET" ? "GET" : "POST",
        accessToken: t.accessToken,
        shopCipher: a.cipher === false ? undefined : cipher,
        query: a.query,
        body: a.body,
      });
      const data = r?.code === 0 ? JSON.stringify(r?.data ?? null) : undefined;
      resultados.push({
        nome: a.nome,
        path: a.path,
        code: r?.code,
        message: String(r?.message || "").slice(0, 200),
        data: data ? (data.length > max ? data.slice(0, max) + `…(+${data.length - max})` : JSON.parse(data)) : undefined,
      });
    } catch (e) {
      resultados.push({ nome: a.nome, path: a.path, erro: e instanceof Error ? e.message.slice(0, 160) : "erro" });
    }
  }
  return NextResponse.json({ sucesso: true, token_renovado: t.renovado, shop_id: token.shop_id, resultados });
}
