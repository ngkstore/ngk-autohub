import { chamarShopee } from "@/lib/shopee/chamar";
import { JANELA_SHOPEE_DIAS } from "@/lib/devolucoes/mapaShopee";
type J = Record<string, unknown>;
void JANELA_SHOPEE_DIAS;
export * from "@/lib/devolucoes/mapaShopee";

// ---- Chamadas à API ----
export async function listarReturnsShopee(lojaId: string, campo: "create_time" | "update_time", de: number, ate: number, pageSize = 50) {
  const todos: J[] = [];
  for (let page = 1; page <= 40; page++) {
    const r = await chamarShopee<{ more?: boolean; return?: J[] }>({
      lojaId,
      path: "/api/v2/returns/get_return_list",
      query: { page_no: page, page_size: pageSize, [`${campo}_from`]: de, [`${campo}_to`]: ate },
    });
    if (r.error) throw new Error(`get_return_list: ${r.error} ${r.message || ""}`);
    todos.push(...(r.response?.return || []));
    if (!r.response?.more) break;
  }
  return todos;
}

export async function detalheReturnShopee(lojaId: string, returnSn: string): Promise<J | null> {
  const r = await chamarShopee<J>({ lojaId, path: "/api/v2/returns/get_return_detail", query: { return_sn: returnSn } });
  if (r.error) throw new Error(`get_return_detail ${returnSn}: ${r.error} ${r.message || ""}`);
  return r.response || null;
}

export async function rastreioReversoShopee(lojaId: string, returnSn: string): Promise<J | null> {
  const r = await chamarShopee<J>({ lojaId, path: "/api/v2/returns/get_reverse_tracking_info", query: { return_sn: returnSn } });
  return r.error ? null : r.response || null;
}
