-- 09/11/2026 — a lista da aba Taxas (top divergências) lê pedido_externo_id e cliente_nome,
-- que não estavam no índice coberto: voltava à linha de 1,2 KB (bitmap heap scan, 25 s).
set statement_timeout = '10min';
drop index if exists public.pedidos_taxas_cov_idx;
create index if not exists pedidos_taxas_cov_idx
  on public.pedidos (loja_id, id)
  include (taxa_comissao, taxa_servico, taxa_servico_afiliado, valor_total, data_pagamento, data_pedido, pedido_externo_id, cliente_nome)
  where marketplace = 'shopee' and escrow_atualizado_em is not null;
analyze public.pedidos;
analyze public.pedidos_taxa_esperada;
