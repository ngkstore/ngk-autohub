-- Marca a ORIGEM de cada pedido. NULL = operação ao vivo (padrão de sempre).
-- 'backfill' = importação histórica (pedidos de antes da conexão do sistema).
--
-- Por que existe: o cron de detalhe ao vivo pega "data_pedido is null" sem
-- ordem. Se o backfill despejar ~250 mil pedidos antigos sem data, o pedido de
-- HOJE ficaria atrás deles na fila e o faturamento ao vivo atrasaria. Com a
-- marca, o cron ao vivo filtra "origem is null" (só ao vivo) e um drenador
-- próprio cuida dos 'backfill' devagar. Escrow já é recente-primeiro, então não
-- precisa de marca lá.
--
-- Idempotente: pode rodar quantas vezes quiser.
alter table pedidos add column if not exists origem text;

-- Índice parcial que serve as DUAS filas de detalhe pendente (só linhas sem
-- detalhe): o cron ao vivo (origem is null) e o drenador (origem='backfill').
-- Conforme os pedidos são enriquecidos, data_pedido deixa de ser null e a linha
-- sai do índice sozinha — o índice encolhe até sumir no fim do backfill.
create index if not exists pedidos_pend_detalhe_idx
  on pedidos (origem) where data_pedido is null;
