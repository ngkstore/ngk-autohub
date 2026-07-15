import { supabase } from "@/lib/supabase";

export type LojaShopee = {
  lojaId: string;
  shopId: string;
  accessToken: string;
};

// Lista as lojas Shopee com token ativo. Os crons iteram sobre esta lista
// para processar cada loja separadamente (multi-loja). O access_token é
// mantido fresco pelo pipeline de pedidos (refresh por loja).
export async function listarLojasShopeeAtivas(): Promise<LojaShopee[]> {
  const { data } = await supabase
    .from("marketplace_tokens")
    .select("loja_id, shop_id, access_token")
    .eq("marketplace", "shopee")
    .eq("status", "ativo");

  return (data || [])
    .filter((t) => t.loja_id && t.shop_id && t.access_token)
    .map((t) => ({
      lojaId: String(t.loja_id),
      shopId: String(t.shop_id),
      accessToken: t.access_token as string,
    }));
}
