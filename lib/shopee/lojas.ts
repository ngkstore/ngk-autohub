import { supabase } from "@/lib/supabase";
import type { Escopo } from "@/lib/conta";

export type LojaShopee = {
  lojaId: string;
  shopId: string;
  accessToken: string;
  contaId: string | null;
};

// Lista as lojas Shopee com token ativo. Os crons iteram sobre esta lista
// para processar cada loja separadamente (multi-loja). O access_token é
// mantido fresco pelo pipeline de pedidos (refresh por loja). Inclui a conta
// dona da loja (para os crons checarem o flag de robô da conta certa).
export async function listarLojasShopeeAtivas(): Promise<LojaShopee[]> {
  const { data } = await supabase
    .from("marketplace_tokens")
    .select("loja_id, shop_id, access_token")
    .eq("marketplace", "shopee")
    .eq("status", "ativo");

  const tokens = (data || []).filter(
    (t) => t.loja_id && t.shop_id && t.access_token
  );

  const lojaIds = tokens.map((t) => t.loja_id);
  const { data: lojas } = await supabase
    .from("lojas")
    .select("id, conta_id")
    .in("id", lojaIds);
  const contaPorLoja = new Map(
    (lojas || []).map((l) => [String(l.id), l.conta_id ?? null])
  );

  return tokens.map((t) => ({
    lojaId: String(t.loja_id),
    shopId: String(t.shop_id),
    accessToken: t.access_token as string,
    contaId: contaPorLoja.get(String(t.loja_id)) ?? null,
  }));
}

// Filtra a lista de lojas ativas pelo escopo do usuário (admin = todas).
export async function lojasShopeeDoEscopo(escopo: Escopo): Promise<LojaShopee[]> {
  const todas = await listarLojasShopeeAtivas();
  if (escopo.admin) return todas;
  return todas.filter((l) => escopo.lojaIds.includes(l.lojaId));
}
