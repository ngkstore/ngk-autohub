-- Backfill histórico 2026 das lojas do Gustavo (conta ...002). Mesmo padrão do
-- backfill_lotes_2026.sql — janelas de 3 dias, tipo='pedidos_backfill'.
-- Ambas conectaram 30/jul -> backfill Jan 1 .. Jul 31.
-- Padrão do sistema: TODA loja Shopee recebe o mesmo tratamento.

-- Facilita house
insert into sync_jobs (marketplace, tipo, status, loja_id, data_inicio, data_fim, progresso, total_registros, criado_em, atualizado_em)
select 'shopee', 'pedidos_backfill', 'pendente', 'a77d4202-127b-4849-be65-cdcb44301ea1'::uuid,
       g, least(g + interval '3 days', '2026-07-31 00:00:00-03:00'::timestamptz), 0, 0, now(), now()
from generate_series('2026-01-01 00:00:00-03:00'::timestamptz,
                     '2026-07-29 00:00:00-03:00'::timestamptz,
                     interval '3 days') g
where not exists (
  select 1 from sync_jobs s
  where s.marketplace = 'shopee' and s.tipo = 'pedidos_backfill'
    and s.loja_id = 'a77d4202-127b-4849-be65-cdcb44301ea1'::uuid
    and s.data_inicio = g
);

-- Tudo aki express
insert into sync_jobs (marketplace, tipo, status, loja_id, data_inicio, data_fim, progresso, total_registros, criado_em, atualizado_em)
select 'shopee', 'pedidos_backfill', 'pendente', '0684ae7b-a2c6-4e17-8e98-84e3b9eab794'::uuid,
       g, least(g + interval '3 days', '2026-07-31 00:00:00-03:00'::timestamptz), 0, 0, now(), now()
from generate_series('2026-01-01 00:00:00-03:00'::timestamptz,
                     '2026-07-29 00:00:00-03:00'::timestamptz,
                     interval '3 days') g
where not exists (
  select 1 from sync_jobs s
  where s.marketplace = 'shopee' and s.tipo = 'pedidos_backfill'
    and s.loja_id = '0684ae7b-a2c6-4e17-8e98-84e3b9eab794'::uuid
    and s.data_inicio = g
);
