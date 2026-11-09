-- F4 (plano de melhorias 09/11/2026): o escrow é lido logo após o pagamento, quando a
-- Shopee ainda mostra a renda ESTIMADA. Quando o repasse cai na carteira (tipo 101) ou a
-- taxa do Acelera é cobrada (458), o valor é final: re-puxa o escrow desses pedidos.
-- Complementa (não substitui) a reconferência do afiliado tardio (32–45 dias).
set statement_timeout = '5min';

alter table pedidos add column if not exists escrow_final boolean not null default false;
create index if not exists pedidos_escrow_final_pend_idx on pedidos (escrow_atualizado_em)
  where marketplace = 'shopee' and pedido_efetivado and not escrow_final;

create or replace function pedidos_para_reconferir_repasse(p_limite int default 150)
returns table(id uuid, loja_id uuid, pedido_externo_id text)
language sql security definer stable as $$
  select p.id, p.loja_id, p.pedido_externo_id
  from pedidos p
  where p.marketplace = 'shopee' and p.pedido_efetivado
    and p.pedido_externo_id not like 'SH-%'
    and not p.escrow_final
    and p.escrow_atualizado_em is not null
    and p.data_pedido >= now() - interval '120 days'
    and exists (
      select 1 from carteira_transacoes t
      where t.loja_id = p.loja_id and t.order_sn = p.pedido_externo_id
        and t.tipo in ('ESCROW_VERIFIED_ADD','FAST_ESCROW_DEDUCT','ESCROW_DEDUCT')
        and t.criado_em > p.escrow_atualizado_em
    )
  order by p.data_pedido desc
  limit p_limite;
$$;
grant execute on function pedidos_para_reconferir_repasse(int) to anon, authenticated;

-- Marca como final os pedidos cujo escrow já foi lido DEPOIS do repasse (histórico).
update pedidos p set escrow_final = true
where p.marketplace = 'shopee' and p.pedido_efetivado and not p.escrow_final
  and p.escrow_atualizado_em is not null
  and exists (
    select 1 from carteira_transacoes t
    where t.loja_id = p.loja_id and t.order_sn = p.pedido_externo_id
      and t.tipo in ('ESCROW_VERIFIED_ADD','FAST_ESCROW_DEDUCT','ESCROW_DEDUCT')
      and t.criado_em <= p.escrow_atualizado_em
  );
