-- T-004 (17/11/2026): falha de entrega cujo pacote NUNCA voltou (reembolso pago, "sendo postado e voltará
-- para você" há meses) vira tipo próprio 'pacote_nao_retornou' (id PNR-<pedido>) para pedir ressarcimento à Shopee.
alter table public.devolucoes drop constraint if exists devolucoes_tipo_check;
alter table public.devolucoes add constraint devolucoes_tipo_check
  check (tipo = any (array['devolucao_reembolso','so_reembolso','troca','cancelamento','falha_entrega','pacote_nao_retornou']));
alter table public.devolucoes add column if not exists dias_parado integer;
