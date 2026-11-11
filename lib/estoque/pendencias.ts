import { montarEstoque } from "@/lib/estoque/consultas";
import type { Pendencia } from "@/lib/devolucoes/pendencias";

// D4 — pendências de estoque para o Painel e alertas: ruptura e crítico.
export async function pendenciasEstoque(lojaIds: string[] | null): Promise<Pendencia[]> {
  const { linhas, temUpseller } = await montarEstoque(lojaIds);
  if (!temUpseller) return [];
  const saida: Pendencia[] = [];
  for (const l of linhas) {
    if (l.status !== "ruptura" && l.status !== "critico") continue;
    const prazo = l.acabaEm;
    saida.push({
      prazo,
      urgencia: l.status === "ruptura" ? "agora" : prazo && new Date(prazo).getTime() - Date.now() < 86400000 ? "hoje" : prazo && new Date(prazo).getTime() - Date.now() < 2 * 86400000 ? "amanha" : "depois",
      canal: "shopee",
      loja_id: lojaIds?.[0] ?? "",
      titulo: l.status === "ruptura" ? `${l.nome ?? l.sku} em ruptura` : `${l.nome ?? l.sku} acaba em ${l.cobertura ?? "?"} dia(s)`,
      detalhe: `${l.sku} · vende ${l.vendaDia.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} por dia · reposição leva ${l.prazoDias} dias · comprar ${l.comprar}`,
      link: `/estoque?q=${encodeURIComponent(l.sku)}`,
      acao: "Ver estoque",
    });
  }
  return saida.slice(0, 20);
}
