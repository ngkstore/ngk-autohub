-- Reclassifica pedido_efetivado e entra_faturamento dos pedidos JÁ existentes
-- com o critério do "Pedidos Pagos" do Shopee: pago = qualquer status que NÃO
-- seja "não pago" (UNPAID), "cancelado" (CANCELLED) ou desconhecido.
-- Inclui "Aguardando NF" (INVOICE_PENDING), "Em cancelamento" (IN_CANCEL), etc.
--
-- Rode UMA vez no Supabase -> SQL Editor -> Run.
-- Substitui o reclassificar_faturamento.sql (faz os dois campos de uma vez).

update pedidos
set pedido_efetivado = (
      upper(coalesce(status, '')) not in ('UNPAID', 'CANCELLED', 'UNKNOWN', '')
    ),
    entra_faturamento = (
      upper(coalesce(status, '')) not in ('UNPAID', 'CANCELLED', 'UNKNOWN', '')
    )
where marketplace = 'shopee';
