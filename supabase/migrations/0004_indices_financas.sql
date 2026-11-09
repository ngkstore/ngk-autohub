-- 09/11/2026 — Finanças zerado / navegação lenta depois do RLS (S4).
-- Causa real: as funções de conciliação, previsão, aging e divergências varrem a tabela
-- pedidos (1,5 GB por causa do jsonb dados_pedido, ~1,2 KB por linha); a leitura passa
-- de 20 s e estoura o statement_timeout de 8 s do PostgREST — a página engole o erro e
-- mostra zero. Índices cobrindo só as colunas usadas permitem index-only scan (~50 MB).
set statement_timeout = '10min';

-- Conciliação, previsão (p90), aging: loja + efetivado, com as colunas de valor/datas.
create index if not exists pedidos_fin_cov_idx
  on public.pedidos (loja_id, pedido_efetivado)
  include (recebido_em, valor_recebido, valor_liquido, valor_total, data_pedido, origem)
  where marketplace in ('shopee','tiktok_shop');

-- Divergências de recebimento: só as linhas divergentes (poucas centenas).
create index if not exists pedidos_diverg_idx
  on public.pedidos (loja_id, data_pedido)
  where marketplace in ('shopee','tiktok_shop') and pedido_efetivado and recebido_em is not null
    and abs(coalesce(valor_recebido, 0) - coalesce(valor_liquido, valor_total)) > 0.5;

-- O servidor (service role) ganha mais folga que a anon: a página inteira do Finanças
-- dispara ~15 funções em paralelo. 25 s ainda fica abaixo do limite da função na Vercel.
alter role service_role set statement_timeout = '25s';

analyze public.pedidos;
