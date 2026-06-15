import { requestShopee } from "./client";

type BuscarProdutosParams = {
  lojaId: string;
};

export async function buscarProdutosShopee({
  lojaId,
}: BuscarProdutosParams) {
  const path = "/api/v2/product/get_item_list";

  const resultado = await requestShopee(lojaId, path, "GET");

  return resultado;
}

export async function buscarDetalhesProdutosShopee({
  lojaId,
  itemIds,
}: {
  lojaId: string;
  itemIds: number[];
}) {
  const path = "/api/v2/product/get_item_base_info";

  const resultado = await requestShopee(lojaId, path, "POST", {
    item_id_list: itemIds,
  });

  return resultado;
}