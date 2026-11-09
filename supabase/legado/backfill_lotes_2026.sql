-- Cria a fila do BACKFILL histórico de 2026 (pedidos de antes da conexão).
-- Janelas de 3 dias (cada lote ~2-3k pedidos, fecha bem dentro dos 300s da
-- Vercel). tipo='pedidos_backfill' -> invisível pro cron ao vivo.
-- NOT EXISTS: idempotente, pode rodar de novo sem duplicar.
--
-- NGK conectou 17/jun -> backfill Jan 1 .. Jun 17 (cobre Jun 1-16, que hoje
-- falta no sistema). Piti conectou 15/jul -> backfill Jan 1 .. Jul 15.

-- NGK Store
insert into sync_jobs (marketplace, tipo, status, loja_id, data_inicio, data_fim, progresso, total_registros, criado_em, atualizado_em)
select 'shopee', 'pedidos_backfill', 'pendente', '329df5fb-0d8f-4eb5-af36-ff216152cedf'::uuid,
       g,
       least(g + interval '3 days', '2026-06-18 00:00:00-03:00'::timestamptz),
       0, 0, now(), now()
from generate_series('2026-01-01 00:00:00-03:00'::timestamptz,
                     '2026-06-16 00:00:00-03:00'::timestamptz,
                     interval '3 days') g
where not exists (
  select 1 from sync_jobs s
  where s.marketplace = 'shopee' and s.tipo = 'pedidos_backfill'
    and s.loja_id = '329df5fb-0d8f-4eb5-af36-ff216152cedf'::uuid
    and s.data_inicio = g
);

-- Pitibiribas
insert into sync_jobs (marketplace, tipo, status, loja_id, data_inicio, data_fim, progresso, total_registros, criado_em, atualizado_em)
select 'shopee', 'pedidos_backfill', 'pendente', '697c3bf2-2aea-48ba-90b1-c2beda4e4f1f'::uuid,
       g,
       least(g + interval '3 days', '2026-07-16 00:00:00-03:00'::timestamptz),
       0, 0, now(), now()
from generate_series('2026-01-01 00:00:00-03:00'::timestamptz,
                     '2026-07-14 00:00:00-03:00'::timestamptz,
                     interval '3 days') g
where not exists (
  select 1 from sync_jobs s
  where s.marketplace = 'shopee' and s.tipo = 'pedidos_backfill'
    and s.loja_id = '697c3bf2-2aea-48ba-90b1-c2beda4e4f1f'::uuid
    and s.data_inicio = g
);
