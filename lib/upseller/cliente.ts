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
  const custo = pick(s, "avgCost", "averageCost", "costPrice", "cost", "purchasePrice", "avg_cost");
  return {
    armazem_id: String(pick(s, "warehouseId", "warehouse_id") ?? armazemId ?? ""),
    sku: String(pick(s, "sku", "skuCode", "sku_code", "skuId") ?? ""),
    disponivel: n(pick(s, "availableQty", "availableQuantity", "available", "availableStock", "available_qty")),
    ocupado: n(pick(s, "occupiedQty", "lockedQty", "occupied", "reservedQty", "occupied_qty")),
    em_transito: n(pick(s, "inTransitQty", "transitQty", "inTransit", "in_transit_qty", "purchasingQty")),
    atual: n(pick(s, "totalQty", "stockQty", "quantity", "total", "currentQty", "total_qty")),
    custo_medio: custo === undefined ? null : Number(custo) || null,
    nome: (pick(s, "skuName", "productName", "name") as string | undefined) ?? null,
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


// 4001 "parâmetros inválidos" com os campos soltos: a doc fala num objeto PageWarehouseSkuQuery.
// Tenta as formas abaixo até uma responder sem 4001; a que funcionar fica em cache no processo.
let formaSku: number | null = null;
function variantesArgsSku(armazemId: string, pageNo: number, pageSize: number, skus?: string[]): J[] {
  const base: J = { warehouseIdList: [armazemId], pageNo, pageSize, ...(skus?.length ? { skuList: skus.slice(0, 300) } : {}) };
  return [{ query: base }, { PageWarehouseSkuQuery: base }, base, { request: base }, { params: base }, { query: { ...base, warehouseIdList: [Number(armazemId)] } }];
}
async function chamarSkus(armazemId: string, pageNo: number, pageSize: number, skus?: string[]): Promise<{ resp: J; forma: number }> {
  const cfg = upsellerConfigurado();
  const variantes = variantesArgsSku(armazemId, pageNo, pageSize, skus);
  const ordem = formaSku !== null ? [formaSku, ...variantes.map((_, i) => i).filter((i) => i !== formaSku)] : variantes.map((_, i) => i);
  let ultimo: J = {};
  for (const i of ordem) {
    const resp = cfg.mcp ? await mcpTool<J>("page_warehouse_sku_inventory_list", variantes[i]) : await restUpseller<J>("pageWarehouseSku/v1", variantes[i]);
    ultimo = resp;
    if (Number(resp.code) === 4001) continue;
    formaSku = i;
    return { resp, forma: i };
  }
  return { resp: ultimo, forma: -1 };
}

export async function paginaSkusBruta(armazemId: string): Promise<J> {
  const { resp, forma } = await chamarSkus(armazemId, 1, 5);
  return { forma_que_funcionou: forma, ...resp };
}

export async function listarSkusArmazem(armazemId: string, opts: { skus?: string[]; maxPaginas?: number } = {}): Promise<SkuUp[]> {
  const saida: SkuUp[] = [];
  for (let pageNo = 1; pageNo <= (opts.maxPaginas ?? 100); pageNo++) {
    const { resp } = await chamarSkus(armazemId, pageNo, 100, opts.skus);
    const itens = lista(resp, "skuList", "inventoryList", "list", "records", "data");
    for (const it of itens) {
      const s = mapearSku(it, armazemId);
      if (s.sku) saida.push(s);
    }
    const total = Number(pick((resp.data as J) || resp, "total", "totalCount", "totalRecords") ?? NaN);
    if (itens.length < 100 || (Number.isFinite(total) && saida.length >= total)) break;
  }
  return saida;
}
