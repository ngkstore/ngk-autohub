import { requestShopee } from "./client";

type BuscarAvaliacoesParams = {
  lojaId: string;
};

export async function buscarAvaliacoesShopee({
  lojaId,
}: BuscarAvaliacoesParams) {
  const path = "/api/v2/product/get_comment";

  const resultado = await requestShopee(lojaId, path, "POST", {
    page_size: 100,
    cursor: "",
  });

  return resultado;
}