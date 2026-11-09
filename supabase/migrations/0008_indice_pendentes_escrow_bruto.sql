-- 09/11/2026 — pedidos_sem_escrow_bruto (fila do backfill do escrow bruto) andava o índice
-- de data_pedido e abria a linha de 1,2 KB de cada pedido já processado (3,8 s, 10 mil
-- leituras de disco por rodada). Índice parcial coberto: só o que a função precisa.
set statement_timeout = '10min';
create index if not exists pedidos_escrow_bruto_fila_idx
  on public.pedidos (data_pedido desc)
  include (loja_id, pedido_externo_id)
  where marketplace = 'shopee' and pedido_efetivado and escrow_atualizado_em is not null
    and pedido_externo_id not like 'SH-%';
analyze public.pedidos;
