import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { escopoDoUsuario } from "@/lib/conta";

export const dynamic = "force-dynamic";

// Os endpoints que mais interessam pro Raio-X. Devolve o payload de cada um
// numa tacada só (em vez de abrir uma URL por vez).
const OURO = [
  "meta/get_ads_data", // Ads (impressão/clique/gasto por período)
  "meta/get_non_ads_data", // NÃO-Ads = orgânico -> canibalização!
  "traffic-sources/product-contribution", // origem do tráfego por produto
  "diagnosis/homepage_batch_list_verdict", // veredito da própria Shopee
  "dashboard/product-rankings", // ranking de produtos
  "product/list_estimated_simple_roi_two_data", // ROI estimado por produto
  "report/get_time_graph", // série temporal
  "dashboard/key-metrics", // métricas gerais
];

// Corta payload gigante p/ a resposta não estourar.
function limitar(v: unknown): unknown {
  const txt = JSON.stringify(v);
  if (txt.length <= 20000) return v;
  return {
    _aviso: `payload grande (${txt.length} caracteres) — recortado`,
    _inicio: txt.slice(0, 20000),
  };
}

export async function GET() {
  const escopo = await escopoDoUsuario();

  const resultado: Record<string, unknown> = {};
  for (const alvo of OURO) {
    let q = supabase
      .from("coletor_capturas")
      .select("url, payload, capturado_em")
      .ilike("url", `%${alvo}%`)
      .order("capturado_em", { ascending: false })
      .limit(1);
    if (!escopo.admin) q = q.in("conta_id", escopo.contaId ? [escopo.contaId] : []);
    const { data } = await q;
    resultado[alvo] = data?.[0]
      ? { url: data[0].url, payload: limitar(data[0].payload) }
      : "(não capturado ainda — navegue nessa tela do painel)";
  }

  const { count } = await supabase
    .from("coletor_capturas")
    .select("id", { count: "exact", head: true });

  return NextResponse.json({
    sucesso: true,
    total_capturas_no_banco: count ?? 0,
    endpoints: resultado,
  });
}
