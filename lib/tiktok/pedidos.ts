import { supabase } from "@/lib/supabase";
import { chamarTikTok } from "@/lib/tiktok/client";
import { lojasTikTokAtivas, type LojaTikTok } from "@/lib/tiktok/lojas";

function iso(unixSeg: unknown): string | null {
  const n = Number(unixSeg || 0);
  return n > 0 ? new Date(n * 1000).toISOString() : null;
}
function num(v: unknown): number {
  const n = Number(v || 0);
  return Number.isFinite(n) ? n : 0;
}

// Status do TikTok considerados pagos/efetivados e faturáveis.
const NAO_PAGO = new Set(["UNPAID", "ON_HOLD", "CANCELLED"]);
const FATURAVEL = new Set([
  "AWAITING_SHIPMENT",
  "PARTIALLY_SHIPPING",
  "AWAITING_COLLECTION",
  "IN_TRANSIT",
  "DELIVERED",
  "COMPLETED",
]);

type Pedido = Record<string, unknown>;

function mapear(o: Pedido, lojaId: string) {
  const status = String(o.status || "");
  const pay = (o.payment as Record<string, unknown>) || {};
  const recipient = (o.recipient_address as Record<string, unknown>) || {};
  // "Vendas" = subtotal dos itens (sem frete), p/ alinhar com a Shopee.
  const valorItens = num(pay.sub_total) || num(pay.total_amount);
  // O nome real vem no cpf_name (recipient.name costuma vir mascarado/vazio).
  const nome =
    (o.cpf_name as string) ||
    (recipient.name as string) ||
    (o.buyer_email as string) ||
    null;

  return {
    loja_id: lojaId,
    marketplace: "tiktok_shop",
    pedido_externo_id: String(o.id),
    cliente_nome: nome,
    valor_total: valorItens,
    status,
    data_pedido: iso(o.create_time),
    data_pagamento: iso(o.paid_time) || iso(o.create_time),
    pedido_efetivado: !NAO_PAGO.has(status),
    entra_faturamento: FATURAVEL.has(status),
    dados_pedido: o,
    criado_em: iso(o.create_time),
  };
}

// Busca uma página de pedidos do TikTok. page_size/sort vão na QUERY; o TikTok
// devolve do mais ANTIGO pro mais novo por padrão, então pedimos DESC (recentes
// primeiro). Filtro opcional por data de criação (create_time_ge) no body.
async function buscarPagina(
  loja: LojaTikTok,
  pageToken: string,
  desdeUnix?: number,
  pageSize = 50
) {
  const query: Record<string, string> = {
    page_size: String(pageSize),
    sort_field: "create_time",
    sort_order: "DESC",
  };
  if (pageToken) query.page_token = pageToken;

  const body: Record<string, unknown> = {};
  if (desdeUnix) body.create_time_ge = desdeUnix;

  return chamarTikTok("/order/202309/orders/search", {
    method: "POST",
    accessToken: loja.accessToken,
    shopCipher: loja.shopCipher,
    query,
    body,
  });
}

export type ResultadoTikTokPedidos = {
  loja: string;
  novos: number;
  atualizados: number;
  total_lidos: number;
  erro?: string;
  amostra?: unknown;
};

// Sincroniza os pedidos de UMA loja TikTok (pagina até acabar ou o teto).
export async function sincronizarPedidosTikTokLoja(
  loja: LojaTikTok,
  maxPaginas = 20,
  desdeUnix?: number
): Promise<ResultadoTikTokPedidos> {
  let pageToken = "";
  let novos = 0;
  let atualizados = 0;
  let lidos = 0;
  let amostra: unknown = undefined;

  for (let p = 0; p < maxPaginas; p++) {
    const resp = await buscarPagina(loja, pageToken, desdeUnix);
    if (resp?.code !== 0) {
      return {
        loja: loja.lojaId,
        novos,
        atualizados,
        total_lidos: lidos,
        erro: `${resp?.code} | ${resp?.message}`,
        amostra,
      };
    }

    const orders: Pedido[] = resp?.data?.orders || [];
    if (orders.length === 0) break;
    if (!amostra) amostra = orders[0]; // 1 pedido cru p/ conferência
    lidos += orders.length;

    const registros = orders.map((o) => mapear(o, loja.lojaId));
    const ids = registros.map((r) => r.pedido_externo_id);

    const { data: existentes } = await supabase
      .from("pedidos")
      .select("pedido_externo_id")
      .eq("loja_id", loja.lojaId)
      .in("pedido_externo_id", ids);
    const jaTem = new Set((existentes || []).map((e) => e.pedido_externo_id));

    const paraInserir = registros.filter((r) => !jaTem.has(r.pedido_externo_id));
    if (paraInserir.length > 0) {
      await supabase.from("pedidos").insert(paraInserir);
      novos += paraInserir.length;
    }
    for (const r of registros.filter((x) => jaTem.has(x.pedido_externo_id))) {
      await supabase
        .from("pedidos")
        .update({
          status: r.status,
          valor_total: r.valor_total,
          data_pagamento: r.data_pagamento,
          pedido_efetivado: r.pedido_efetivado,
          entra_faturamento: r.entra_faturamento,
          dados_pedido: r.dados_pedido,
        })
        .eq("loja_id", loja.lojaId)
        .eq("pedido_externo_id", r.pedido_externo_id);
      atualizados++;
    }

    pageToken = resp?.data?.next_page_token || "";
    if (!pageToken) break;
  }

  return { loja: loja.lojaId, novos, atualizados, total_lidos: lidos, amostra };
}

// maxPaginas menor no cron (só os recentes, rápido); maior no manual/backfill.
export async function sincronizarPedidosTikTok(maxPaginas = 20, desdeUnix?: number) {
  const lojas = await lojasTikTokAtivas();
  const resultados: ResultadoTikTokPedidos[] = [];
  for (const loja of lojas) {
    resultados.push(await sincronizarPedidosTikTokLoja(loja, maxPaginas, desdeUnix));
  }
  return resultados;
}
