-- ============================================================================
-- Re-conferência do afiliado tardio (comissão aplicada ~30 dias após o pedido).
-- Retorna os pedidos que acabaram de cruzar 32 dias e foram enriquecidos ANTES
-- disso (afiliado ainda 0) — o enricher re-puxa o escrow deles p/ pegar o
-- afiliado que faltava. JANELA ESTREITA (32-45 dias) via índice de data_pedido:
-- barata. NÃO varre a tabela toda (uma versão antiga varria e SATURAVA o banco).
-- Chamado por lib/shopee/enriquecerEscrow.ts (reconferir:true) via o cron
-- /api/shopee/pedidos/enriquecer-financeiro?reconferir=1&limite=150 (horário).
-- ============================================================================
create or replace function reconferencia_escrow_ids(p_limite int default 150)
returns table(id uuid, loja_id uuid, pedido_externo_id text)
language sql security definer stable as $$
  select p.id, p.loja_id, p.pedido_externo_id from pedidos p
  where p.marketplace = 'shopee' and p.pedido_efetivado
    and p.pedido_externo_id not like 'SH-%'
    and p.data_pedido >= now() - interval '45 days'
    and p.data_pedido <  now() - interval '32 days'
    and p.escrow_atualizado_em < p.data_pedido + interval '32 days'
    and coalesce(p.comissao_afiliado, 0) = 0
  order by p.data_pedido asc
  limit p_limite;
$$;
grant execute on function reconferencia_escrow_ids(int) to anon, authenticated;
