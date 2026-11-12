// Conferência "tela × banco" da Visão geral. Roda só com acesso ao banco
// (.env.local com SUPABASE_URL + service role); sem ele, os testes são pulados.
// Compara o que a tela mostra (RPC resumo_pedidos, que lê a tabela derivada
// pedidos_resumo_diario) com a soma direta em `pedidos` e com Finanças.
import { describe, expect, it } from "vitest";
import { lojasAtivas, rpc, temBanco, janelaFechada, perto } from "./banco";

describe.skipIf(!temBanco())("Visão geral × banco", () => {
  it("cada loja ativa (Shopee e TikTok): resumo da tela = soma direta em pedidos (janela fechada de 7 dias)", async () => {
    const lojas = await lojasAtivas();
    const { inicio, fim } = janelaFechada(7);
    expect(lojas.length).toBeGreaterThan(0);
    for (const loja of lojas) {
      const tela = await rpc<{ pedidos_efetivados: number; faturamento_efetivado: number }>("resumo_pedidos", { p_loja_ids: [loja.id], p_inicio: inicio, p_fim: fim });
      const banco = await rpc<{ pedidos_efetivados: number; faturamento_efetivado: number }>("conferencia_resumo_pedidos", { p_loja_ids: [loja.id], p_inicio: inicio, p_fim: fim });
      // tabela derivada é refeita de hora em hora: tolerância de 0,5 % (ou 5 pedidos)
      expect(perto(Number(tela.pedidos_efetivados), Number(banco.pedidos_efetivados), 0.005, 5), `${loja.apelido}: pedidos ${tela.pedidos_efetivados} × ${banco.pedidos_efetivados}`).toBe(true);
      expect(perto(Number(tela.faturamento_efetivado), Number(banco.faturamento_efetivado), 0.005, 50), `${loja.apelido}: faturamento ${tela.faturamento_efetivado} × ${banco.faturamento_efetivado}`).toBe(true);
    }
  });

  it("loja TikTok ativa não aparece zerada nos últimos 30 dias (regressão de 12/11/2026)", async () => {
    const lojas = (await lojasAtivas()).filter((l) => l.marketplace === "tiktok_shop");
    const { inicio, fim } = janelaFechada(30);
    for (const loja of lojas) {
      const tela = await rpc<{ pedidos_efetivados: number }>("resumo_pedidos", { p_loja_ids: [loja.id], p_inicio: inicio, p_fim: fim });
      expect(Number(tela.pedidos_efetivados), `${loja.apelido} zerada na Visão geral`).toBeGreaterThan(0);
    }
  });

  it("Visão geral e Finanças mostram a mesma receita e os mesmos pedidos pagos", async () => {
    const lojas = await lojasAtivas();
    const { inicio, fim } = janelaFechada(7);
    for (const loja of lojas) {
      const tela = await rpc<{ pedidos_efetivados: number; faturamento_efetivado: number }>("resumo_pedidos", { p_loja_ids: [loja.id], p_inicio: inicio, p_fim: fim });
      const fin = await rpc<{ total_pedidos: number; receita_bruta: number }>("resumo_financas", { p_loja_ids: [loja.id], p_inicio: inicio, p_fim: fim, p_conta: null });
      expect(perto(Number(tela.pedidos_efetivados), Number(fin.total_pedidos), 0.005, 5), `${loja.apelido}: pedidos ${tela.pedidos_efetivados} × Finanças ${fin.total_pedidos}`).toBe(true);
      expect(perto(Number(tela.faturamento_efetivado), Number(fin.receita_bruta), 0.005, 50), `${loja.apelido}: receita ${tela.faturamento_efetivado} × Finanças ${fin.receita_bruta}`).toBe(true);
    }
  });

  it("avaliações: respondidas e pelo robô vêm preenchidos (não 0 %)", async () => {
    const { inicio, fim } = janelaFechada(30);
    const r = await rpc<{ total: number; respondidas: number; pelo_robo: number }>("resumo_avaliacoes", { p_loja_ids: null, p_inicio: inicio, p_fim: fim });
    if (Number(r.total) === 0) return;
    expect(Number(r.respondidas)).toBeGreaterThan(0);
    expect(Number(r.respondidas)).toBeLessThanOrEqual(Number(r.total));
    expect(Number(r.pelo_robo)).toBeLessThanOrEqual(Number(r.respondidas));
  });
});
