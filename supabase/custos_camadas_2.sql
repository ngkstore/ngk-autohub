-- Complemento de custos_camadas.sql (09/11/2026):
--  1) compensações: as transações SEM tipo "Reembolso por objeto perdido" são
--     as compensações que faltavam na conferência (bateu ao centavo jun–nov).
--  2) fila do backfill do escrow bruto (Camada 1).
set statement_timeout = '5min';

create or replace function chave_referencia_carteira(p_tipo text, p_categoria text)
returns text language sql immutable as $$
  select case
    when p_tipo = 'ESCROW_VERIFIED_ADD' then 'renda'
    when p_tipo in ('FAST_ESCROW_DISBURSE','FAST_ESCROW_DISBURSE_REMAINING') then 'acelera'
    when p_tipo in ('FAST_ESCROW_DEDUCT','ESCROW_DEDUCT') then 'acelera_taxa'
    when p_categoria = 'ads' then 'ads'
    when p_tipo = 'ADJUSTMENT_FOR_RR_AFTER_ESCROW_VERIFIED' then 'reembolso'
    when p_tipo = 'ESCROW_VERIFIED_MINUS' then 'estorno'
    when p_tipo = 'ADJUSTMENT_CENTER_DEDUCT' then 'ajuste407'
    when p_tipo = 'AMS_COMMISSION_FEE_DEDUCT' then 'afiliado463'
    when p_categoria = 'compensacao' then 'compensacoes'
    else null end
$$;

-- Pedidos Shopee efetivados que ainda não têm o escrow bruto guardado
-- (mais recentes primeiro). p_loja null = todas as lojas.
create or replace function pedidos_sem_escrow_bruto(p_loja uuid default null, p_desde date default '2026-01-01', p_ate date default null, p_limite int default 400)
returns table(loja_id uuid, pedido_externo_id text, data_pedido timestamptz)
language sql stable as $$
  select p.loja_id, p.pedido_externo_id, p.data_pedido
  from pedidos p
  where p.marketplace = 'shopee' and p.pedido_efetivado
    and p.pedido_externo_id not like 'SH-%'
    and p.escrow_atualizado_em is not null
    and (p_loja is null or p.loja_id = p_loja)
    and p.data_pedido >= p_desde::timestamptz
    and (p_ate is null or p.data_pedido < (p_ate + 1)::timestamptz)
    and not exists (select 1 from pedido_escrow e where e.loja_id = p.loja_id and e.order_sn = p.pedido_externo_id)
  order by p.data_pedido desc
  limit p_limite;
$$;
grant execute on function pedidos_sem_escrow_bruto(uuid, date, date, int) to anon, authenticated;

-- Resumo da cobertura do bruto por loja (p/ a tela).
create or replace function cobertura_escrow_bruto(p_loja_ids uuid[] default null, p_inicio timestamptz default null, p_fim timestamptz default null)
returns json language sql stable as $$
  with ped as (
    select count(*) as total
    from pedidos p
    where p.marketplace = 'shopee' and p.pedido_efetivado and p.pedido_externo_id not like 'SH-%'
      and (p_loja_ids is null or p.loja_id = any(p_loja_ids))
      and (p_inicio is null or p.data_pedido >= p_inicio) and (p_fim is null or p.data_pedido < p_fim)
  ),
  com as (
    select count(distinct c.order_sn) as n
    from custos_pedido c
    where c.campo = 'repasse'
      and (p_loja_ids is null or c.loja_id = any(p_loja_ids))
      and (p_inicio is null or c.data_pedido >= p_inicio) and (p_fim is null or c.data_pedido < p_fim)
  )
  select json_build_object('pedidos', ped.total, 'com_detalhamento', com.n) from ped, com;
$$;
grant execute on function cobertura_escrow_bruto(uuid[], timestamptz, timestamptz) to anon, authenticated;
