import { NextRequest, NextResponse } from "next/server";
import { autorizarAdmin } from "@/lib/autorizacao";
import { chamarShopee } from "@/lib/shopee/chamar";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Sondagem SÓ DE LEITURA da API da Shopee (cron ou administrador): devolve a resposta crua
// de um endpoint get_* para descobrir campos/enums (ex.: falhas de entrega).
//   ?loja=<id>&path=/api/v2/logistics/get_tracking_info&q={"order_sn":"..."}
export async function GET(request: NextRequest) {
  const autz = await autorizarAdmin(request);
  if (!autz.ok) return autz.resposta;
  const sp = request.nextUrl.searchParams;
  const lojaId = sp.get("loja") || "";
  const path = sp.get("path") || "";
  if (!lojaId || !/^\/api\/v2\/[a-z_]+\/get_[a-z_]+$/.test(path)) {
    return NextResponse.json({ sucesso: false, erro: "informe loja e um path /api/v2/<modulo>/get_<nome>" }, { status: 400 });
  }
  let query: Record<string, string | number | boolean | undefined> = {};
  try {
    query = sp.get("q") ? (JSON.parse(sp.get("q") as string) as Record<string, string | number | boolean | undefined>) : {};
  } catch {
    return NextResponse.json({ sucesso: false, erro: "q precisa ser JSON" }, { status: 400 });
  }
  const r = await chamarShopee<Record<string, unknown>>({ lojaId, path, query });
  // nada de dados pessoais do comprador na saída
  const texto = JSON.stringify(r).replace(/"(recipient_address|buyer_username|buyer_user_id|phone|full_address|name)":\s*("(?:[^"\\]|\\.)*"|\{[^}]*\})/g, '"$1":"***"');
  return new NextResponse(texto, { headers: { "content-type": "application/json" } });
}
