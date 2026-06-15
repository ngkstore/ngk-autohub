import { requestShopee } from "./client";

type BuscarPedidosParams = {
  lojaId: string;
};

export async function buscarPedidosShopee({
  lojaId,
}: BuscarPedidosParams) {
  const path = "/api/v2/order/get_order_list";

  const agora = Math.floor(Date.now() / 1000);

  const resultado = await requestShopee(
    lojaId,
    path,
    "POST",
    {
      time_range_field: "create_time",
      time_from: agora - 86400 * 30,
      time_to: agora,
      page_size: 100,
      order_status: "READY_TO_SHIP",
    }
  );

  return resultado;
}

export async function buscarDetalhesPedidosShopee({
  lojaId,
  orderSnList,
}: {
  lojaId: string;
  orderSnList: string[];
}) {
  const path = "/api/v2/order/get_order_detail";

  const resultado = await requestShopee(
    lojaId,
    path,
    "POST",
    {
      order_sn_list: orderSnList,
      response_optional_fields: [
        "item_list",
        "total_amount",
        "buyer_username",
        "order_status",
      ],
    }
  );

  return resultado;
}