import crypto from "crypto";
import { chamar, obterToken } from "@/lib/shopee/adsColetor";

// FASE 4 (execução assistida): edita orçamento diário e/ou meta ROAS de UMA
// campanha de produto (ad_type manual + bidding auto = GMV Max meta ROAS) via
// edit_manual_product_ads. Uma ação por chamada (change_budget / change_roas_target),
// cada uma com reference_id próprio (a Shopee usa pra deduplicar). Só é chamado
// pela rota /api/shopee/ads/ajustar, que exige usuário logado dono da loja e
// confirmação manual na tela. `simular=true` monta o payload sem enviar.

export type CampoEdicao = "orcamento" | "meta_roas";
export type AcaoEdicao = { campo: CampoEdicao; valor: number };
export type ResultadoEdicao = {
  campo: CampoEdicao;
  valor: number;
  reference_id: string;
  body: Record<string, unknown>;
  sucesso: boolean;
  simulado: boolean;
  resposta?: Record<string, unknown>;
  erro?: string;
};

export async function editarCampanhaProduto({
  lojaId,
  campaignId,
  acoes,
  simular = false,
}: {
  lojaId: string;
  campaignId: number;
  acoes: AcaoEdicao[];
  simular?: boolean;
}): Promise<ResultadoEdicao[]> {
  const tok = await obterToken(lojaId);
  if (!tok) throw new Error("Loja sem token Shopee ativo.");

  const saida: ResultadoEdicao[] = [];
  for (const a of acoes) {
    const reference_id = crypto.randomUUID();
    const body: Record<string, unknown> =
      a.campo === "orcamento"
        ? { reference_id, campaign_id: campaignId, edit_action: "change_budget", budget: a.valor }
        : { reference_id, campaign_id: campaignId, edit_action: "change_roas_target", roas_target: a.valor };

    if (simular) {
      saida.push({ campo: a.campo, valor: a.valor, reference_id, body, sucesso: true, simulado: true });
      continue;
    }
    const r = await chamar("/api/v2/ads/edit_manual_product_ads", tok, "", body);
    const erro = String(r?.error || "");
    saida.push({
      campo: a.campo,
      valor: a.valor,
      reference_id,
      body,
      sucesso: !erro,
      simulado: false,
      resposta: r,
      erro: erro ? `${erro} | ${String(r?.message || "")}` : undefined,
    });
  }
  return saida;
}
