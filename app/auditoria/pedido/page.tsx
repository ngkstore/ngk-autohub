import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { buscarEscrowDetalhe } from "@/lib/shopee/escrowDetalhe";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ order_sn?: string }> };

// Rótulos amigáveis dos campos do escrow (o que cada cobrança é).
const LABELS: Record<string, string> = {
  order_selling_price: "Valor de venda (mercadoria)",
  order_original_price: "Preço original",
  order_seller_discount: "Desconto do vendedor",
  buyer_total_amount: "Total pago pelo comprador",
  escrow_amount: "Líquido a receber",
  commission_fee: "Comissão",
  service_fee: "Taxa de serviço",
  seller_transaction_fee: "Taxa de transação (vendedor)",
  credit_card_transaction_fee: "Taxa cartão de crédito",
  voucher_from_seller: "Cupom do vendedor",
  voucher_from_shopee: "Cupom da Shopee",
  coins: "Moedas Shopee",
  buyer_paid_shipping_fee: "Frete pago pelo comprador",
  actual_shipping_fee: "Frete real",
  estimated_shipping_fee: "Frete estimado",
  shopee_shipping_rebate: "Subsídio de frete (Shopee)",
  reverse_shipping_fee: "Frete de devolução",
  final_shipping_fee: "Frete final",
  campaign_fee: "Taxa de campanha",
};

function num(v: unknown) {
  return Number(v || 0);
}
function moeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function faixa(preco: number) {
  if (preco < 80) return { pct: 0.2, fixa: 4 };
  if (preco < 100) return { pct: 0.14, fixa: 16 };
  if (preco < 200) return { pct: 0.14, fixa: 20 };
  return { pct: 0.14, fixa: 26 };
}

type Item = {
  item_name?: string;
  model_discounted_price?: number;
  model_quantity_purchased?: number;
};

export default async function DetalhePedidoPage({ searchParams }: Props) {
  const { order_sn: orderSn } = await searchParams;

  if (!orderSn) {
    return (
      <div className="p-8 text-white">
        <h1 className="text-3xl font-bold">Detalhe do pedido</h1>
        <p className="mt-2 text-slate-400">Informe um pedido (?order_sn=...).</p>
      </div>
    );
  }

  const { data: pedido } = await supabase
    .from("pedidos")
    .select("pedido_externo_id, cliente_nome, valor_total, dados_pedido")
    .eq("pedido_externo_id", orderSn)
    .maybeSingle();

  const escrow = await buscarEscrowDetalhe(orderSn);

  const itens: Item[] = Array.isArray(
    (pedido?.dados_pedido as { item_list?: Item[] })?.item_list
  )
    ? ((pedido!.dados_pedido as { item_list?: Item[] }).item_list as Item[])
    : [];

  // Esperado item a item (sua regra).
  const linhasItens = itens.map((it) => {
    const preco = num(it.model_discounted_price);
    const qtd = num(it.model_quantity_purchased) || 1;
    const f = faixa(preco);
    const esperadoUn = preco * f.pct + f.fixa;
    return {
      nome: it.item_name || "Item",
      preco,
      qtd,
      pct: f.pct,
      fixa: f.fixa,
      esperado: esperadoUn * qtd,
    };
  });
  const taxaEsperada = linhasItens.reduce((t, l) => t + l.esperado, 0);
  const taxaReal = num(escrow.income.commission_fee) + num(escrow.income.service_fee);
  const diferenca = taxaReal - taxaEsperada;

  // Campos conhecidos presentes + todos os valores != 0 (transparência total).
  const income = escrow.income || {};
  const conhecidos = Object.keys(LABELS)
    .filter((k) => income[k] !== undefined && num(income[k]) !== 0)
    .map((k) => ({ label: LABELS[k], chave: k, valor: num(income[k]) }));
  const outros = Object.entries(income)
    .filter(
      ([k, v]) => typeof v === "number" && v !== 0 && !LABELS[k]
    )
    .map(([k, v]) => ({ chave: k, valor: Number(v) }));

  return (
    <div className="p-8 text-white">
      <Link href="/auditoria" className="text-sm text-slate-400 hover:text-white">
        ← Voltar para Auditoria
      </Link>

      <h1 className="mt-2 text-3xl font-bold">Pedido {orderSn}</h1>
      <p className="mt-1 text-slate-400">
        Cliente: {pedido?.cliente_nome || "-"} • Venda:{" "}
        {moeda(num(pedido?.valor_total))}
      </p>

      {escrow.erro && (
        <div className="mt-4 rounded-xl bg-yellow-900/40 px-4 py-3 text-sm text-yellow-200">
          Não consegui buscar o escrow agora: {escrow.erro}
        </div>
      )}

      {/* Itens e comissão esperada */}
      <section className="mt-8 rounded-2xl bg-slate-900 p-6">
        <h2 className="text-2xl font-bold">Itens e taxa esperada (sua regra)</h2>
        <div className="mt-4 overflow-x-auto rounded-xl border border-slate-800">
          <table className="w-full text-left">
            <thead className="bg-slate-800 text-sm text-slate-300">
              <tr>
                <th className="p-3">Item</th>
                <th className="p-3">Preço</th>
                <th className="p-3">Qtd</th>
                <th className="p-3">% + fixa</th>
                <th className="p-3">Esperado</th>
              </tr>
            </thead>
            <tbody>
              {linhasItens.map((l, i) => (
                <tr key={i} className="border-t border-slate-800">
                  <td className="p-3">{l.nome}</td>
                  <td className="p-3">{moeda(l.preco)}</td>
                  <td className="p-3">{l.qtd}</td>
                  <td className="p-3 text-slate-400">
                    {(l.pct * 100).toFixed(0)}% + {moeda(l.fixa)}
                  </td>
                  <td className="p-3">{moeda(l.esperado)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Comparação */}
      <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-3">
        <div className="rounded-2xl bg-slate-900 p-6">
          <p className="text-sm text-slate-400">Taxa esperada (regra)</p>
          <p className="mt-2 text-2xl font-bold">{moeda(taxaEsperada)}</p>
        </div>
        <div className="rounded-2xl bg-slate-900 p-6">
          <p className="text-sm text-slate-400">Taxa cobrada (Shopee)</p>
          <p className="mt-2 text-2xl font-bold">{moeda(taxaReal)}</p>
        </div>
        <div
          className={`rounded-2xl p-6 ${
            Math.abs(diferenca) > 0.5
              ? "border border-red-700 bg-slate-900"
              : "bg-slate-900"
          }`}
        >
          <p className="text-sm text-slate-400">Diferença</p>
          <p
            className={`mt-2 text-2xl font-bold ${
              diferenca > 0.5
                ? "text-red-300"
                : diferenca < -0.5
                ? "text-emerald-300"
                : "text-slate-200"
            }`}
          >
            {diferenca > 0 ? "+" : ""}
            {moeda(diferenca)}
          </p>
        </div>
      </div>

      {/* Composição da cobrança (escrow) */}
      <section className="mt-6 rounded-2xl bg-slate-900 p-6">
        <h2 className="text-2xl font-bold">Composição da cobrança (Shopee)</h2>
        <p className="mt-1 text-sm text-slate-400">
          Cada linha é um valor real do repasse. Use para identificar cupom,
          promoção, frete ou cobrança indevida.
        </p>

        <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-2">
          {conhecidos.map((c) => (
            <div
              key={c.chave}
              className="flex items-center justify-between rounded-lg bg-slate-800 px-4 py-2"
            >
              <span className="text-sm text-slate-300">{c.label}</span>
              <span className="font-semibold">{moeda(c.valor)}</span>
            </div>
          ))}
        </div>

        {outros.length > 0 && (
          <>
            <p className="mt-5 text-sm font-semibold text-slate-300">
              Outros valores do escrow (≠ 0)
            </p>
            <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
              {outros.map((o) => (
                <div
                  key={o.chave}
                  className="flex items-center justify-between rounded-lg bg-slate-950 px-4 py-2"
                >
                  <span className="text-xs text-slate-500">{o.chave}</span>
                  <span className="text-sm">{moeda(o.valor)}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
