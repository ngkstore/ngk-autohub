-- Reclassifica entra_faturamento dos pedidos JÁ existentes para acompanhar
-- pedido_efetivado (faturamento reconhecido a partir de "Pronto p/ envio").
--
-- Rode UMA vez no Supabase -> SQL Editor -> Run.
-- Os pedidos novos já vêm classificados certo pelo código.

update pedidos
set entra_faturamento = (
  upper(coalesce(status, '')) in (
    'READY_TO_SHIP',
    'PROCESSED',
    'SHIPPED',
    'TO_CONFIRM_RECEIVE',
    'COMPLETED'
  )
)
where marketplace = 'shopee';
