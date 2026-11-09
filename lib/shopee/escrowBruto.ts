import { supabase } from "@/lib/supabase";

// Camada 1 do custo linha a linha: guarda o detalhamento BRUTO do escrow
// (order_income + buyer_payment_info) em pedido_escrow e manda o banco gerar
// as linhas de custos_pedido (custos_pedido_linhas / rebuild_custos_pedido).
// O mapeamento campo -> linha mora no SQL, então muda sem redeploy.

export type EscrowBruto = {
  lojaId: string;
  orderSn: string;
  income: Record<string, unknown>;
  buyer: Record<string, unknown> | null;
};

export async function guardarEscrowBruto(registros: EscrowBruto[]): Promise<{ gravados: number; linhas: number; erro?: string }> {
  if (registros.length === 0) return { gravados: 0, linhas: 0 };
  let gravados = 0;
  let linhas = 0;
  let erro: string | undefined;

  // Upsert em blocos (payload jsonb ~5 KB por pedido).
  for (let i = 0; i < registros.length; i += 100) {
    const bloco = registros.slice(i, i + 100).map((r) => ({
      loja_id: r.lojaId,
      order_sn: r.orderSn,
      income: r.income,
      buyer: r.buyer,
      atualizado_em: new Date().toISOString(),
    }));
    const { error } = await supabase.from("pedido_escrow").upsert(bloco, { onConflict: "loja_id,order_sn" });
    if (error) {
      erro = error.message;
      break;
    }
    gravados += bloco.length;
  }

  // Linhas por loja (a função é por loja + lista de pedidos).
  const porLoja = new Map<string, string[]>();
  for (const r of registros.slice(0, gravados)) {
    const lista = porLoja.get(r.lojaId) ?? [];
    lista.push(r.orderSn);
    porLoja.set(r.lojaId, lista);
  }
  for (const [lojaId, orderSns] of porLoja) {
    const { data, error } = await supabase.rpc("rebuild_custos_pedido", { p_loja: lojaId, p_order_sns: orderSns });
    if (error) erro = error.message;
    else linhas += Number(data || 0);
  }
  return { gravados, linhas, erro };
}
