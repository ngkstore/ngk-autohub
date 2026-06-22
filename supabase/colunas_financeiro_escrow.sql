-- Colunas para a conciliação financeira (dados do get_escrow_detail).
-- Rode UMA vez no Supabase -> SQL Editor -> Run (seguro rodar de novo).

alter table pedidos add column if not exists valor_pago numeric;        -- total pago pelo comprador
alter table pedidos add column if not exists valor_liquido numeric;     -- escrow: líquido a receber
alter table pedidos add column if not exists taxa_comissao numeric;     -- commission_fee
alter table pedidos add column if not exists taxa_servico numeric;      -- service_fee
alter table pedidos add column if not exists cupom_shopee numeric;      -- voucher/desconto da Shopee
alter table pedidos add column if not exists cupom_loja numeric;        -- voucher do vendedor
alter table pedidos add column if not exists frete numeric;             -- frete pago pelo comprador
alter table pedidos add column if not exists desconto_vendedor numeric; -- desconto do anúncio
alter table pedidos add column if not exists escrow_atualizado_em timestamptz; -- quando puxamos o escrow

-- Índice para achar rápido os pedidos que ainda faltam conciliar.
create index if not exists idx_pedidos_escrow_pendente
  on pedidos (marketplace, escrow_atualizado_em);
