import { supabase } from "@/lib/supabase";
import { garantirTokenTikTok, type LinhaTokenTikTok } from "@/lib/tiktok/token";

export type LojaTikTok = {
  lojaId: string;
  shopId: string;
  shopCipher: string;
  accessToken: string;
};

// Lojas TikTok com token ativo (e shop_cipher, necessário nas chamadas).
// Renova o access_token na hora se estiver a menos de 1h de vencer (o token do
// TikTok dura 7 dias) — assim o sync se cura sozinho em vez de morrer calado.
export async function lojasTikTokAtivas(): Promise<LojaTikTok[]> {
  const { data } = await supabase
    .from("marketplace_tokens")
    .select("id, loja_id, shop_id, shop_cipher, access_token, refresh_token, expire_in, status")
    .eq("marketplace", "tiktok_shop")
    .eq("status", "ativo");

  const saida: LojaTikTok[] = [];
  for (const t of data || []) {
    if (!t.loja_id || !t.access_token || !t.shop_cipher) continue;
    const tok = await garantirTokenTikTok(t as unknown as LinhaTokenTikTok, 3600);
    if (tok.erro) continue; // ficou 'expirado' no banco; o cron de refresh avisa no Telegram
    saida.push({
      lojaId: String(t.loja_id),
      shopId: String(t.shop_id),
      shopCipher: t.shop_cipher as string,
      accessToken: tok.accessToken,
    });
  }
  return saida;
}
