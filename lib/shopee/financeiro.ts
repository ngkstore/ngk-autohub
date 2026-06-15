import { requestShopee } from "./client";

type BuscarFinanceiroParams = {
  lojaId: string;
};

export async function buscarFinanceiroShopee({
  lojaId,
}: BuscarFinanceiroParams) {
  const path = "/api/v2/payment/get_escrow_detail";

  /*
    Observação:
    A Shopee normalmente exige um order_sn para buscar detalhes financeiros.
    Então este módulo será usado junto com pedidos.
  */

  return {
    sucesso: true,
    mensagem:
      "Módulo financeiro Shopee preparado. Será executado a partir dos pedidos com order_sn.",
    path,
  };
}

export async function buscarFinanceiroPorPedidoShopee({
  lojaId,
  orderSn,
}: {
  lojaId: string;
  orderSn: string;
}) {
  const path = "/api/v2/payment/get_escrow_detail";

  const resultado = await requestShopee(lojaId, path, "POST", {
    order_sn: orderSn,
  });

  return resultado;
}