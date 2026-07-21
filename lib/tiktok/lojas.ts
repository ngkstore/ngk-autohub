import { supabase } from "@/lib/supabase";

export type LojaTikTok = {
  lojaId: string;
  shopId: string;
  shopCipher: string;
  accessToken: string;
};

// Lojas TikTok com token ativo (e shop_cipher, necessário nas chamadas).
export async function lojasTikTokAtivas(): Promise<LojaTikTok[]> {
  const { data } = await supabase
    .from("marketplace_tokens")
    .select("loja_id, shop_id, shop_cipher, access_token")
    .eq("marketplace", "tiktok_shop")
    .eq("status", "ativo");

  return (data || [])
    .filter((t) => t.loja_id && t.access_token && t.shop_cipher)
    .map((t) => ({
      lojaId: String(t.loja_id),
      shopId: String(t.shop_id),
      shopCipher: t.shop_cipher as string,
      accessToken: t.access_token as string,
    }));
}
