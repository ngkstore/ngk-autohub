import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { escopoDoUsuario } from "@/lib/conta";

export const dynamic = "force-dynamic";

// Mostra o payload COMPLETO de uma captura, p/ eu modelar o parser.
// Use ?contem=meta/get_ads_data  (pedaço da URL)
export async function GET(request: NextRequest) {
  const escopo = await escopoDoUsuario();
  const contem = request.nextUrl.searchParams.get("contem") || "";

  if (!contem) {
    return NextResponse.json({
      sucesso: false,
      erro: "Informe ?contem=<pedaço da url>. Ex.: ?contem=meta/get_ads_data",
    });
  }

  let q = supabase
    .from("coletor_capturas")
    .select("url, shop_id, loja_id, payload, capturado_em")
    .ilike("url", `%${contem}%`)
    .order("capturado_em", { ascending: false })
    .limit(1);
  if (!escopo.admin) q = q.in("conta_id", escopo.contaId ? [escopo.contaId] : []);

  const { data, error } = await q;
  if (error) {
    return NextResponse.json({ sucesso: false, erro: error.message }, { status: 500 });
  }
  if (!data || data.length === 0) {
    return NextResponse.json({ sucesso: false, erro: `Nada capturado com "${contem}".` });
  }

  return NextResponse.json({ sucesso: true, captura: data[0] });
}
