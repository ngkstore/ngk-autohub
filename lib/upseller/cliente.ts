// Cliente da API/MCP do UpSeller (D1). O AutoHub só LÊ (nunca escreve estoque).
// Duas portas, pela doc disponível em 11/11/2026 (help-doc-article-3414/3415):
//  1) MCP (streamable-http, documentado): POST https://openapi.upseller.com/mcp com
//     Authorization: Bearer <MCP token>, X-Upseller-Language: pt. Ferramentas:
//     get_warehouse_list_by_puid { warehouseType } e page_warehouse_sku_inventory_list
//     { warehouseIdList, skuList?, pageNo, pageSize, updateTime? }.
//  2) REST (guia Feishu em chinês, sem acesso público): POST <base>/<path> com JSON e três
//     cabeçalhos (id do cliente, token, idioma). Os nomes dos cabeçalhos ficam em variáveis
//     para ajustar sem deploy quando o Gabriel tiver a doc: UPSELLER_HEADER_CLIENT (padrão
//     X-Upseller-Client-Id), UPSELLER_HEADER_TOKEN (X-Upseller-Token), UPSELLER_HEADER_LANG.
// Variáveis: UPSELLER_MCP_TOKEN (porta 1) e/ou UPSELLER_CLIENT_ID + UPSELLER_API_TOKEN (porta 2).
type J = Record<string, unknown>;
const BASE = process.env.UPSELLER_API_BASE_URL || "https://openapi.upseller.com";

export function upsellerConfigurado(): { mcp: boolean; rest: boolean } {
  return { mcp: !!process.env.UPSELLER_MCP_TOKEN, rest: !!(process.env.UPSELLER_CLIENT_ID && process.env.UPSELLER_API_TOKEN) };
}

let mcpId = 1;
// Chamada crua de uma ferramenta SÓ DE LEITURA (sondagem): devolve a resposta inteira.
export async function mcpToolBruto(name: string, args: J): Promise<J> {
  if (!/^(get_|page_)/.test(name)) throw new Error("só ferramentas de leitura (get_/page_)");
  return mcpTool<J>(name, args);
}
// tools/list: devolve o inputSchema de cada ferramenta (para descobrir os nomes dos parâmetros).
export async function mcpListaFerramentas(): Promise<J> {
  const token = process.env.UPSELLER_MCP_TOKEN;
  if (!token) throw new Error("UPSELLER_MCP_TOKEN ausente na Vercel.");
  const r = await fetch(`${BASE}/mcp`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, Accept: "text/event-stream, application/json", "Content-Type": "application/json", "X-Upseller-Language": "pt" },
    body: JSON.stringify({ jsonrpc: "2.0", id: mcpId++, method: "tools/list", params: {} }),
    cache: "no-store",
  });
  const texto = await r.text();
  if (texto.trimStart().startsWith("{")) return JSON.parse(texto);
  let payload: J = {};
  for (const linha of texto.split("\n")) {
    const m = linha.match(/^data:\s*(\{.*\})\s*$/);
    if (m) {
      try {
        payload = JSON.parse(m[1]);
      } catch {
        /* parcial */
      }
    }
  }
  return payload;
}
// Chamada de ferramenta via MCP (JSON-RPC 2.0 sobre streamable-http). Lê JSON ou SSE.
export async function mcpTool<T = J>(name: string, args: J): Promise<T> {
  const token = process.env.UPSELLER_MCP_TOKEN;
  if (!token) throw new Error("UPSELLER_MCP_TOKEN ausente na Vercel.");
  const r = await fetch(`${BASE}/mcp`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, Accept: "text/event-stream, application/json", "Content-Type": "application/json", "X-Upseller-Language": "pt" },
    body: JSON.stringify({ jsonrpc: "2.0", id: mcpId++, method: "tools/call", params: { name, arguments: args } }),
    cache: "no-store",
  });
  const texto = await r.text();
  if (!r.ok) throw new Error(`UpSeller MCP ${name}: HTTP ${r.status} ${texto.slice(0, 200)}`);
  // SSE: pega o último "data:" com JSON; JSON puro: parse direto
  let payload: J | null = null;
  if (texto.trimStart().startsWith("{")) payload = JSON.parse(texto);
  else {
    for (const linha of texto.split("\n")) {
      const m = linha.match(/^data:\s*(\{.*\})\s*$/);
      if (m) {
        try {
          payload = JSON.parse(m[1]);
        } catch {
          /* linha parcial */
        }
      }
    }
  }
  if (!payload) throw new Error(`UpSeller MCP ${name}: resposta vazia`);
  if (payload.error) throw new Error(`UpSeller MCP ${name}: ${JSON.stringify(payload.error).slice(0, 300)}`);
  const result = (payload.result as J) || {};
  if (result.isError) throw new Error(`UpSeller MCP ${name}: ${JSON.stringify(result.content).slice(0, 300)}`);
  // structuredContent (quando existe) ou o texto do primeiro bloco como JSON
  if (result.structuredContent) return result.structuredContent as T;
  const bloco = (Array.isArray(result.content) ? (result.content as J[]) : []).find((c) => c.type === "text");
  if (bloco && typeof bloco.text === "string") {
    try {
      return JSON.parse(bloco.text) as T;
    } catch {
      return { texto: bloco.text } as unknown as T;
    }
  }
  return result as unknown as T;
}

// Chamada REST (porta 2). Devolve o JSON bruto.
export async function restUpseller<T = J>(path: string, body: J): Promise<T> {
  const clientId = process.env.UPSELLER_CLIENT_ID;
  const token = process.env.UPSELLER_API_TOKEN;
  if (!clientId || !token) throw new Error("UPSELLER_CLIENT_ID / UPSELLER_API_TOKEN ausentes na Vercel.");
  const h: Record<string, string> = { "Content-Type": "application/json" };
  h[process.env.UPSELLER_HEADER_CLIENT || "X-Upseller-Client-Id"] = clientId;
  h[process.env.UPSELLER_HEADER_TOKEN || "X-Upseller-Token"] = token;
  h[process.env.UPSELLER_HEADER_LANG || "X-Upseller-Language"] = "pt";
  const r = await fetch(`${BASE}/${path.replace(/^\//, "")}`, { method: "POST", headers: h, body: JSON.stringify(body), cache: "no-store" });
  const texto = await r.text();
  if (!r.ok) throw new Error(`UpSeller REST ${path}: HTTP ${r.status} ${texto.slice(0, 200)}`);
  try {
    return JSON.parse(texto) as T;
  } catch {
    throw new Error(`UpSeller REST ${path}: resposta não é JSON (${texto.slice(0, 120)})`);
  }
}

// ---- Leituras usadas pelo módulo (tentam MCP; senão REST) ----
export type ArmazemUp = { id: string; nome: string; tipo?: string; bruto: J };
export type SkuUp = { armazem_id: string; sku: string; disponivel: number; ocupado: number; em_transito: number; atual: number; custo_medio: number | null; nome?: string | null; bruto: J };

const n = (v: unknown) => (v === null || v === undefined || v === "" ? 0 : Number(v) || 0);
const pick = (o: J, ...chaves: string[]): unknown => {
  for (const k of chaves) if (o[k] !== undefined && o[k] !== null) return o[k];
  return undefined;
};

export function mapearArmazem(a: J): ArmazemUp {
  return { id: String(pick(a, "warehouseId", "id", "warehouse_id") ?? ""), nome: String(pick(a, "warehouseName", "name", "warehouse_name") ?? ""), tipo: pick(a, "warehouseType", "type") as string | undefined, bruto: a };
}
export function mapearSku(s: J, armazemId?: string): SkuUp {
  // Formato real (12/11/2026): { sku, skuTitle, skuType: "KIT"|"SKU", isGroup, unitCost, subTotal,
  //   up_info: { onHand, allocated, available, inTransit, inTransitPurchase, inTransitTransfer }, warehouseId }
  const up = (s.up_info as J) || {};
  const disponivel = n(pick(up, "available", "availableQty"));
  const ocupado = n(pick(up, "allocated", "occupiedQty", "lockedQty"));
  const transito = n(pick(up, "inTransit")) || n(pick(up, "inTransitPurchase")) + n(pick(up, "inTransitTransfer"));
  const atual = n(pick(up, "onHand", "totalQty", "quantity"));
  const custo = pick(s, "unitCost", "avgCost", "averageCost", "costPrice", "cost");
  return {
    armazem_id: String(pick(s, "warehouseId", "warehouse_id") ?? armazemId ?? ""),
    sku: String(pick(s, "sku", "skuCode", "sku_code") ?? ""),
    disponivel,
    ocupado,
    em_transito: transito,
    atual: atual || disponivel + ocupado,
    custo_medio: custo === undefined || custo === null ? null : Number(custo) || null,
    nome: (pick(s, "skuTitle", "skuName", "productName", "name") as string | undefined) ?? null,
    bruto: s,
  };
}

function lista(resp: J, ...chaves: string[]): J[] {
  for (const k of chaves) {
    const v = resp[k];
    if (Array.isArray(v)) return v as J[];
    if (v && typeof v === "object") {
      const inner = lista(v as J, ...chaves, "list", "records", "items", "data");
      if (inner.length) return inner;
    }
  }
  for (const k of ["data", "result", "list", "records", "items"]) if (Array.isArray(resp[k])) return resp[k] as J[];
  return [];
}

export async function listarArmazens(): Promise<ArmazemUp[]> {
  const cfg = upsellerConfigurado();
  let resp: J;
  if (cfg.mcp) resp = await mcpTool<J>("get_warehouse_list_by_puid", { warehouseType: "ALL" });
  else resp = await restUpseller<J>("getWarehouseList/v1", { warehouseType: "ALL" });
  return lista(resp, "warehouseList", "warehouses", "list", "data").map(mapearArmazem).filter((a) => a.id);
}


// Schema real da ferramenta (tools/list): { request: { warehouseIdList: string[], pageNo?: string (CURSOR
// devolvido em data.nextPageNo; a 1ª página vai sem), pageSize: 1..100, skuList?, updateTime? } }.
// Resposta: { code, message, data: { skuList, nextPageNo, hasMore, totalCount } }.
async function chamarSkus(armazemId: string, cursor: string | null, pageSize: number, skus?: string[]): Promise<J> {
  const cfg = upsellerConfigurado();
  const request: J = { warehouseIdList: [armazemId], pageSize, ...(cursor ? { pageNo: cursor } : {}), ...(skus?.length ? { skuList: skus.slice(0, 300) } : {}) };
  return cfg.mcp ? mcpTool<J>("page_warehouse_sku_inventory_list", { request }) : restUpseller<J>("pageWarehouseSku/v1", request);
}
export async function paginaSkusBruta(armazemId: string): Promise<J> {
  return chamarSkus(armazemId, null, 5);
}

export async function listarSkusArmazem(armazemId: string, opts: { skus?: string[]; maxPaginas?: number } = {}): Promise<SkuUp[]> {
  const saida: SkuUp[] = [];
  let cursor: string | null = null;
  for (let i = 0; i < (opts.maxPaginas ?? 100); i++) {
    const resp = await chamarSkus(armazemId, cursor, 100, opts.skus);
    if (Number(resp.code) !== 0) throw new Error(`page_warehouse_sku_inventory_list: ${resp.code} ${resp.message}`);
    const data = (resp.data as J) || {};
    for (const it of (data.skuList as J[]) || []) {
      const s = mapearSku(it, armazemId);
      if (s.sku) saida.push(s);
    }
    cursor = data.hasMore && data.nextPageNo ? String(data.nextPageNo) : null;
    if (!cursor) break;
  }
  return saida;
}
