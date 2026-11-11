import { chamarTikTok } from "@/lib/tiktok/client";
import type { LojaTikTok } from "@/lib/tiktok/lojas";
type J = Record<string, unknown>;
export * from "@/lib/devolucoes/mapaTikTok";

// ---- Chamadas à API ----
async function paginar(loja: LojaTikTok, path: string, body: J, chave: string, maxPaginas = 40): Promise<J[]> {
  const todos: J[] = [];
  let pageToken = "";
  for (let i = 0; i < maxPaginas; i++) {
    const r = await chamarTikTok(path, {
      method: "POST",
      accessToken: loja.accessToken,
      shopCipher: loja.shopCipher,
      query: { page_size: "50", ...(pageToken ? { page_token: pageToken } : {}) },
      body,
    });
    if (r.code === 36009002 && i < maxPaginas - 1) {
      // limite de taxa: espera e tenta a mesma página de novo
      await new Promise((ok) => setTimeout(ok, 2500));
      continue;
    }
    if (r.code !== 0) throw new Error(`${path}: ${r.code} ${r.message}`);
    todos.push(...((r.data?.[chave] as J[]) || []));
    pageToken = r.data?.next_page_token || "";
    if (!pageToken) break;
  }
  return todos;
}

export function listarReturnsTikTok(loja: LojaTikTok, desdeUnix: number) {
  return paginar(loja, "/return_refund/202602/returns/search", { update_time_ge: desdeUnix }, "return_orders");
}
export function listarCancelamentosTikTok(loja: LojaTikTok, desdeUnix: number) {
  return paginar(loja, "/return_refund/202602/cancellations/search", { update_time_ge: desdeUnix }, "cancellations");
}
export async function recordsTikTok(loja: LojaTikTok, returnId: string): Promise<J[]> {
  const r = await chamarTikTok(`/return_refund/202309/returns/${encodeURIComponent(returnId)}/records`, { accessToken: loja.accessToken, shopCipher: loja.shopCipher });
  if (r.code !== 0) return [];
  return (r.data?.records as J[]) || [];
}
export async function buscarReturnTikTok(loja: LojaTikTok, returnId: string): Promise<J | null> {
  const r = await chamarTikTok("/return_refund/202602/returns/search", {
    method: "POST",
    accessToken: loja.accessToken,
    shopCipher: loja.shopCipher,
    query: { page_size: "1" },
    body: { return_ids: [returnId] },
  });
  if (r.code !== 0) return null;
  return ((r.data?.return_orders as J[]) || [])[0] || null;
}
