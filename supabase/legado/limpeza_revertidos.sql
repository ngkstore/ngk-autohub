-- Limpeza (one-time, 27/ago/2026): pedidos com escrow puxado e líquido ZERO
-- (cancelados/devolvidos depois do pagamento) estavam contados como "pago",
-- inflando a CONTAGEM de receita (não o lucro, que usa o líquido=0). Nenhum
-- deles recebeu nada na carteira. ~845 pedidos / ~R$68k no ano.
--
-- Daqui pra frente isso é automático: o enriquecerEscrow marca
-- pedido_efetivado=false quando escrow_amount<=0 (ver lib/shopee/enriquecerEscrow.ts).
update pedidos
set pedido_efetivado = false, entra_faturamento = false, atualizado_em = now()
where marketplace = 'shopee'
  and pedido_efetivado = true
  and escrow_atualizado_em is not null
  and coalesce(valor_liquido, 0) = 0
  and recebido_em is null;
