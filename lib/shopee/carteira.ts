import crypto from "crypto";
import { supabase } from "@/lib/supabase";

const BASE_URL = process.env.SHOPEE_API_BASE_URL || "https://partner.shopeemobile.com";
const PATH = "/api/v2/payment/get_wallet_transaction_list";
const JANELA_DIAS = 14; // limite da Shopee por chamada
const PAGE_SIZE = 100;

type TokenLoja = { accessToken: string; shopId: string };

async function obterToken(lojaId: string): Promise<TokenLoja | null> {
  const { data } = await supabase
    .from("marketplace_tokens")
    .select("access_token, shop_id")
    .eq("marketplace", "shopee")
    .eq("status", "ativo")
    .eq("loja_id", lojaId)
    .limit(1)
    .maybeSingle();
  if (!data?.access_token || !data?.shop_id) return null;
  return { accessToken: data.access_token, shopId: String(data.shop_id) };
}

// Classificação pelo TIPO da transação (o texto muda, o tipo não). Espelho da
// tabela carteira_categorias + classificar_carteira() do banco (fonte da
// verdade): depois do upsert o sync chama reclassificar_carteira(loja), então
// um tipo novo cadastrado na tabela vale sem redeploy.
const MAPA_TIPO: Record<string, string> = {
  ESCROW_VERIFIED_ADD: "renda",
  ESCROW_VERIFIED_MINUS: "estorno",
  FAST_ESCROW_DISBURSE: "antecipacao",
  FAST_ESCROW_DISBURSE_REMAINING: "antecipacao",
  FAST_ESCROW_DEDUCT: "acelera_taxa",
  ESCROW_DEDUCT: "acelera_taxa",
  SPM_DEDUCT: "ads",
  SPM_DEDUCT_DIRECT: "emprestimo",
  SPM_DISBURSE_ADD: "emprestimo_entrada",
  PAID_BY_WALLET: "pagamento_carteira",
  APM_DEDUCT: "pagamento_carteira",
  ADJUSTMENT_FOR_RR_AFTER_ESCROW_VERIFIED: "reembolso",
  ADJUSTMENT_CENTER_DEDUCT: "ajuste_debito",
  ADJUSTMENT_CENTER_ADD: "compensacao",
  FULFILMENT_COMPENSATE_ADD: "compensacao",
  RETURN_COMPENSATION_SERVICE_ADD: "compensacao",
  LOST_PARCEL_SELLER_ADD: "compensacao",
  SELLER_COMPENSATE_ADD: "compensacao",
  AMS_COMMISSION_FEE_DEDUCT: "afiliado_ajuste",
  AFFILIATE_FEE_DEDUCT: "afiliado_ajuste",
  AFFILIATE_SAMPLE_SHIPPING_FEE_DEDUCT: "afiliado_ajuste",
  BR_DIFAL_FEE_CHARGE: "difal",
  FBS_ADJUSTMENT_MINUS: "logistica_full",
  FBS_FEE_CHARGE_MINUS: "logistica_full",
  WITHDRAWAL_CREATED: "saque",
  WITHDRAWAL_COMPLETED: "saque",
  PIX_TRANSFER_SEND_CREATED: "saque",
  PIX_TRANSFER_SEND_COMPLETED: "saque",
};

export function categoriaCarteira(tipo: string | null | undefined, descricao: string): string {
  const d = (descricao || "").toLowerCase();
  if (!tipo) return d.includes("reembolso por objeto perdido") ? "compensacao" : "desconhecido";
  if (tipo === "ADJUSTMENT_CENTER_DEDUCT") {
    if (d.includes("difal") || d.includes("diferencial de al")) return "difal";
    if (d.includes("volumoso")) return "logistica_volumoso";
    if (d.includes("cubad")) return "logistica_peso";
    if (d.includes("creditado a maior")) return "estorno_credito";
    return "ajuste_debito";
  }
  // Parcela do "Empréstimo para Vendedores" vem como SPM_DEDUCT_DIRECT (mesmo
  // prefixo dos Ads). Empréstimo não é despesa: fica fora do resultado.
  if (tipo === "SPM_DEDUCT_DIRECT" && !(d.includes("empr") && d.includes("stimo")) && !d.includes("loan")) return "ads";
  return MAPA_TIPO[tipo] ?? "desconhecido";
}

type WalletTx = {
  transaction_id: number | string;
  transaction_type?: string;
  order_sn?: string;
  amount?: number;
  current_balance?: number;
  money_flow?: string;
  description?: string;
  create_time?: number;
};

function assinar(partnerId: string, partnerKey: string, accessToken: string, shopId: string, ts: number) {
  return crypto
    .createHmac("sha256", partnerKey)
    .update(`${partnerId}${PATH}${ts}${accessToken}${shopId}`)
    .digest("hex");
}

async function buscarPagina(
  token: TokenLoja,
  de: number,
  ate: number,
  pageNo: number
): Promise<{ lista: WalletTx[]; more: boolean; erro?: string }> {
  const partnerId = process.env.SHOPEE_PARTNER_ID!;
  const partnerKey = process.env.SHOPEE_PARTNER_KEY!;
  const ts = Math.floor(Date.now() / 1000);
  const sign = assinar(partnerId, partnerKey, token.accessToken, token.shopId, ts);
  const url =
    `${BASE_URL}${PATH}?partner_id=${partnerId}&timestamp=${ts}` +
    `&access_token=${encodeURIComponent(token.accessToken)}&shop_id=${token.shopId}&sign=${sign}` +
    `&page_no=${pageNo}&page_size=${PAGE_SIZE}&create_time_from=${de}&create_time_to=${ate}`;
  const r = await fetch(url, { method: "GET", cache: "no-store" });
  const data = await r.json();
  if (data?.error) return { lista: [], more: false, erro: data.error };
  return {
    lista: data?.response?.transaction_list || [],
    more: !!data?.response?.more,
  };
}

export type ResultadoCarteira = {
  lojaId: string;
  importadas: number;
  erro?: string;
};

// Sincroniza o extrato da carteira de UMA loja (janelas de 14 dias, paginado),
// grava em carteira_transacoes e casa com os pedidos (recebido_em).
export async function sincronizarCarteiraLoja({
  lojaId,
  dias = 30,
  pular = 0,
}: {
  lojaId: string;
  dias?: number;
  pular?: number; // dias a "pular" a partir de hoje (backfill em janelas)
}): Promise<ResultadoCarteira> {
  const token = await obterToken(lojaId);
  if (!token) return { lojaId, importadas: 0, erro: "sem token ativo" };

  const agora = Math.floor(Date.now() / 1000) - pular * 24 * 60 * 60;
  const limite = agora - dias * 24 * 60 * 60;
  let importadas = 0;
  let erro: string | undefined;

  // Percorre em janelas de 14 dias (do mais recente para trás).
  for (let ate = agora; ate > limite; ate -= JANELA_DIAS * 24 * 60 * 60) {
    const de = Math.max(limite, ate - JANELA_DIAS * 24 * 60 * 60);
    // Até 500 páginas × 100 = 50 mil transações por janela (a NGK passou de 20 mil em jan/2026).
    for (let page = 1; page <= 500; page++) {
      const { lista, more, erro: e } = await buscarPagina(token, de, ate, page);
      if (e) {
        erro = e;
        break;
      }
      if (lista.length === 0) break;

      const linhas = lista.map((tx) => {
        const desc = tx.description || "";
        return {
          loja_id: lojaId,
          transaction_id: String(tx.transaction_id),
          tipo: tx.transaction_type || null,
          categoria: categoriaCarteira(tx.transaction_type, desc),
          order_sn: tx.order_sn || null,
          valor: typeof tx.amount === "number" ? tx.amount : Number(tx.amount || 0),
          saldo:
            typeof tx.current_balance === "number"
              ? tx.current_balance
              : Number(tx.current_balance || 0),
          money_flow: tx.money_flow || null,
          descricao: desc,
          criado_em: tx.create_time
            ? new Date(tx.create_time * 1000).toISOString()
            : null,
        };
      });

      // Upsert por (loja_id, transaction_id) — não duplica em re-sync.
      const { error: upErr } = await supabase
        .from("carteira_transacoes")
        .upsert(linhas, { onConflict: "loja_id,transaction_id" });
      if (upErr) {
        erro = upErr.message;
        break;
      }
      importadas += linhas.length;

      if (!more) break;
    }
    if (erro) break;
  }

  // Classificação definitiva pela tabela do banco (fonte da verdade) e
  // casamento carteira x pedidos (recebido_em/valor_recebido).
  await supabase.rpc("reclassificar_carteira", { p_loja: lojaId });
  await supabase.rpc("casar_carteira_pedidos", { p_loja: lojaId });

  return { lojaId, importadas, erro };
}
