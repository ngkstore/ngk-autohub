import { NextRequest, NextResponse } from "next/server";
import { autorizarAdmin } from "@/lib/autorizacao";
import { chamarShopee } from "@/lib/shopee/chamar";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// B0 (Devoluções): sondagem SÓ DE LEITURA do módulo `returns` da Shopee.
//   GET ?loja=<loja_id>&dias=30&limite=10            → get_return_list (+ detalhe do 1º)
//   GET ?loja=<loja_id>&return_sn=<sn>               → get_return_detail + get_available_solutions
// Cron (Bearer CRON_SECRET) ou administrador. Nunca chama endpoints que escrevem.
export async function GET(request: NextRequest) {
  const autz = await autorizarAdmin(request);
  if (!autz.ok) return autz.resposta;
  const sp = request.nextUrl.searchParams;
  const lojaId = sp.get("loja");
  if (!lojaId) return NextResponse.json({ sucesso: false, erro: "Informe ?loja=<loja_id>." }, { status: 400 });
  const returnSn = sp.get("return_sn");

  try {
    if (returnSn) {
      const [detalhe, solucoes] = await Promise.all([
        chamarShopee({ lojaId, path: "/api/v2/returns/get_return_detail", query: { return_sn: returnSn } }),
        chamarShopee({ lojaId, path: "/api/v2/returns/get_available_solutions", query: { return_sn: returnSn } }),
      ]);
      return NextResponse.json({ sucesso: true, detalhe, solucoes });
    }

    const dias = Math.min(90, Number(sp.get("dias")) || 30);
    const limite = Math.min(50, Number(sp.get("limite")) || 10);
    const agora = Math.floor(Date.now() / 1000);
    const lista = await chamarShopee<{ more?: boolean; return?: Record<string, unknown>[] }>({
      lojaId,
      path: "/api/v2/returns/get_return_list",
      query: { page_no: 1, page_size: limite, create_time_from: agora - dias * 86400, create_time_to: agora },
    });
    const primeiro = lista.response?.return?.[0]?.return_sn as string | undefined;
    const detalhe = primeiro ? await chamarShopee({ lojaId, path: "/api/v2/returns/get_return_detail", query: { return_sn: primeiro } }) : null;
    return NextResponse.json({
      sucesso: !lista.error,
      permissao: lista.error === "error_permission" || lista.error === "error_auth" ? "NEGADA" : lista.error ? `erro: ${lista.error}` : "OK",
      lista,
      detalhe_do_primeiro: detalhe,
    });
  } catch (e) {
    return NextResponse.json({ sucesso: false, erro: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
