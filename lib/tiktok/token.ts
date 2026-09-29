import { supabase } from "@/lib/supabase";
import { renovarTokenTikTok } from "@/lib/tiktok/client";
import { enviarTelegram } from "@/lib/telegram";

// Renovação do access_token do TikTok Shop. O token dura 7 dias (expire_in em unix)
// e o refresh_token ~30 dias, renovado a cada troca. Sem esta rotina o sync de
// pedidos morreu em 28/07/2026 (token de 21/07 + 7 dias) sem nenhum alarme.

export type LinhaTokenTikTok = {
  id: string;
  loja_id: string;
  access_token: string;
  refresh_token: string;
  expire_in: number | null; // unix (segundos) em que o access_token expira
  status: string;
};

export type ResultadoRenovacao = {
  accessToken: string;
  renovado: boolean;
  expiraEm?: string;
  erro?: string;
};

// Garante um access_token válido: renova se faltar menos de `margemSeg` pra
// expirar (ou se `forcar`). Grava o novo par de tokens; se a renovação falhar
// (refresh_token vencido/revogado) marca status='expirado' — aí só reconectando.
export async function garantirTokenTikTok(
  linha: LinhaTokenTikTok,
  margemSeg = 6 * 3600,
  forcar = false
): Promise<ResultadoRenovacao> {
  const agora = Math.floor(Date.now() / 1000);
  const expira = Number(linha.expire_in || 0);
  if (!forcar && expira && expira - agora > margemSeg) {
    return { accessToken: linha.access_token, renovado: false, expiraEm: new Date(expira * 1000).toISOString() };
  }
  if (!linha.refresh_token) {
    return { accessToken: linha.access_token, renovado: false, erro: "sem refresh_token" };
  }

  const r = await renovarTokenTikTok(linha.refresh_token).catch((e) => ({
    code: -1,
    message: e instanceof Error ? e.message : String(e),
    data: null,
  }));
  const d = (r?.data || null) as {
    access_token?: string;
    refresh_token?: string;
    access_token_expire_in?: number;
    refresh_token_expire_in?: number;
  } | null;

  if (r?.code !== 0 || !d?.access_token) {
    const erro = `${r?.code ?? "?"} ${String(r?.message || "sem resposta").slice(0, 160)}`;
    await supabase
      .from("marketplace_tokens")
      .update({ status: "expirado", atualizado_em: new Date().toISOString() })
      .eq("id", linha.id);
    return { accessToken: linha.access_token, renovado: false, erro };
  }

  const novoExpira = Number(d.access_token_expire_in || 0) || agora + 7 * 86400;
  await supabase
    .from("marketplace_tokens")
    .update({
      access_token: d.access_token,
      refresh_token: d.refresh_token || linha.refresh_token,
      expire_in: novoExpira,
      expira_em: new Date(novoExpira * 1000).toISOString(),
      status: "ativo",
      atualizado_em: new Date().toISOString(),
    })
    .eq("id", linha.id);
  return { accessToken: d.access_token, renovado: true, expiraEm: new Date(novoExpira * 1000).toISOString() };
}

// Rotina do cron (diária): renova os tokens que vencem nas próximas 24h (ou todos,
// se `forcar`). Avisa no Telegram quando uma loja precisa ser reconectada.
export async function renovarTokensTikTok(forcar = false) {
  const { data } = await supabase
    .from("marketplace_tokens")
    .select("id, loja_id, access_token, refresh_token, expire_in, status")
    .eq("marketplace", "tiktok_shop")
    .in("status", ["ativo", "expirado"]);

  const lojas: { loja_id: string; status_antes: string; renovado: boolean; expira_em?: string; erro?: string }[] = [];
  for (const l of (data || []) as LinhaTokenTikTok[]) {
    const r = await garantirTokenTikTok(l, 24 * 3600, forcar || l.status === "expirado");
    lojas.push({ loja_id: l.loja_id, status_antes: l.status, renovado: r.renovado, expira_em: r.expiraEm, erro: r.erro });
    if (r.erro) {
      await enviarTelegram(
        `⚠️ TikTok Shop: não consegui renovar o token (${r.erro}).\n` +
          `O sync de pedidos do TikTok fica parado até reconectar: abra /api/tiktok/auth?loja=${l.loja_id} logado no AutoHub.`
      );
    }
  }
  return { lojas };
}
