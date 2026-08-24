-- ============================================================================
-- PERFORMANCE do Dashboard/Financeiro — evita timeout do role anon (~3s).
-- Rode no Supabase -> SQL Editor -> Run (seguro rodar de novo).
-- ============================================================================

-- Índice de cobertura: resumo_pedidos agrega SEM ler o heap (que tem o
-- dados_pedido gordo por linha). Vira index-only scan -> ~1-2s em vez de 13s.
create index if not exists pedidos_resumo_cov on pedidos (loja_id)
  include (valor_total, pedido_efetivado, entra_faturamento, status, marketplace, data_pagamento, data_pedido);

-- Filtro por loja (escopo por conta) usa índice em vez de seq scan.
create index if not exists pedidos_loja_idx on pedidos (loja_id);

-- O timeout padrão do anon (3s) é curto demais p/ agregações do dashboard.
-- A app roda server-side (chave anon), então subimos p/ 20s.
alter role anon set statement_timeout = '20s';
alter role authenticated set statement_timeout = '20s';
-- (recarrega o PostgREST p/ pegar a config nova)
notify pgrst, 'reload config';

-- Normaliza o status das lojas ("ativa" -> "ativo") p/ o contador "Lojas Ativas".
update lojas set status = 'ativo' where status = 'ativa';
