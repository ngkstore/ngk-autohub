-- 11/11/2026 — o backfill trouxe pedidos de jul–out/2026 com rule_id antigos da taxa de serviço
-- (a Shopee troca o id a cada período). Identificados pela proporção da venda, igual ao par
-- atual 1000074 (~1,4–2% = transação) / 1000075 (~11–15% = por item):
--   jul–set/2026: 100623 (2,0%) transação; 100640 (14,8%), 100642 (13,2%), 100644 (10,7%) por item;
--   set–out/2026: 1000062 (2,0%) transação; 1000064 (11,0%) por item.
--   100646 (3,9%, 4,2 mil pedidos, máx. R$ 150) não casa com nenhum padrão: fica em serv_outros.
-- Só muda a categoria (soma já era true); custos_pedido é regerado para os pedidos afetados.
insert into public.escrow_regras_servico (rule_id, categoria, rotulo) values
  (100623,  'serv_transacao', 'Taxa de transação (regra jul–set/2026)'),
  (100640,  'serv_item',      'Taxa por item vendido (regra jul–set/2026)'),
  (100642,  'serv_item',      'Taxa por item vendido (regra jul–set/2026, variante)'),
  (100644,  'serv_item',      'Taxa por item vendido (regra jul–set/2026, variante)'),
  (1000062, 'serv_transacao', 'Taxa de transação (regra set–out/2026)'),
  (1000064, 'serv_item',      'Taxa por item vendido (regra set–out/2026)')
on conflict (rule_id) do update set categoria = excluded.categoria, rotulo = excluded.rotulo;
