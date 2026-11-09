-- F4 (continuação): o update em massa de escrow_final estourou o tempo da Management
-- API (468 mil pedidos). Versão em lotes: chamar repetidas vezes até devolver 0.
set statement_timeout = '5min';

create or replace function marcar_escrow_final(p_lote int default 20000)
returns int language plpgsql security definer as $$
declare v int;
begin
  with alvo as (
    select p.id from pedidos p
    where p.marketplace = 'shopee' and p.pedido_efetivado and not p.escrow_final
      and p.escrow_atualizado_em is not null
      and exists (
        select 1 from carteira_transacoes t
        where t.loja_id = p.loja_id and t.order_sn = p.pedido_externo_id
          and t.tipo in ('ESCROW_VERIFIED_ADD','FAST_ESCROW_DEDUCT','ESCROW_DEDUCT')
          and t.criado_em <= p.escrow_atualizado_em
      )
    limit p_lote
  )
  update pedidos p set escrow_final = true from alvo where p.id = alvo.id;
  get diagnostics v = row_count;
  return v;
end $$;
grant execute on function marcar_escrow_final(int) to anon, authenticated;
