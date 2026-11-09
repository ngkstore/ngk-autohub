-- 09/11/2026 — aba Taxas (Finanças) e página /auditoria em 60 s.
-- A view pedidos_auditoria recalculava, a cada acesso, a comissão esperada de ~280 mil
-- pedidos abrindo o jsonb dados_pedido (1,2 KB por linha). A taxa esperada só depende de
-- item_list e data_pedido, que não mudam: passa a ficar num cache incremental
-- (pedidos_taxa_esperada), preenchido de hora em hora dentro do job já existente
-- refresh_taxa_item(). A taxa real continua lida ao vivo de pedidos (muda na reconferência).
set statement_timeout = '10min';

create table if not exists public.pedidos_taxa_esperada (
  pedido_id uuid primary key references public.pedidos(id) on delete cascade,
  loja_id uuid not null,
  taxa_esperada numeric not null,
  calculado_em timestamptz not null default now()
);
alter table public.pedidos_taxa_esperada enable row level security;
create index if not exists pedidos_taxa_esperada_loja_idx on public.pedidos_taxa_esperada (loja_id, pedido_id) include (taxa_esperada);

-- Colunas que a auditoria lê de pedidos, sem tocar na linha de 1,2 KB (index-only scan).
create index if not exists pedidos_taxas_cov_idx
  on public.pedidos (loja_id, id)
  include (taxa_comissao, taxa_servico, taxa_servico_afiliado, valor_total, data_pagamento, data_pedido)
  where marketplace = 'shopee' and escrow_atualizado_em is not null;

-- Calcula a taxa esperada só dos pedidos que ainda não têm cache (incremental).
create or replace function public.refresh_taxa_esperada(p_limite integer default 20000)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_n integer;
begin
  insert into public.pedidos_taxa_esperada (pedido_id, loja_id, taxa_esperada)
  select p.id, p.loja_id, coalesce(esp.taxa_esperada, 0)
  from (
    select p.id, p.loja_id, p.data_pedido, p.dados_pedido
    from public.pedidos p
    where p.marketplace = 'shopee' and p.escrow_atualizado_em is not null
      and coalesce(p.valor_total, 0) > 0
      and jsonb_typeof(p.dados_pedido -> 'item_list') = 'array'
      and not exists (select 1 from public.pedidos_taxa_esperada c where c.pedido_id = p.id)
    order by p.data_pedido desc nulls last
    limit p_limite
  ) p
  left join lateral (
    select round(sum(itens.q * shopee_taxa_esperada_item(itens.preco, (p.data_pedido at time zone 'America/Sao_Paulo')::date)), 2) as taxa_esperada
    from (
      select coalesce(nullif(it.value ->> 'model_quantity_purchased', '')::numeric, 1) as q,
             case when coalesce(nullif(it.value ->> 'model_discounted_price', '')::numeric, 0) > 0
                  then nullif(it.value ->> 'model_discounted_price', '')::numeric
                  else coalesce(nullif(it.value ->> 'model_original_price', '')::numeric, 0) end as preco
      from jsonb_array_elements(p.dados_pedido -> 'item_list') it(value)
    ) itens
    where itens.preco > 0
  ) esp on true
  on conflict (pedido_id) do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke execute on function public.refresh_taxa_esperada(integer) from anon, authenticated;

-- A view mantém nome e colunas (as páginas /financas e /auditoria leem direto dela).
create or replace view public.pedidos_auditoria as
select p.id, p.loja_id, p.marketplace, p.pedido_externo_id, p.cliente_nome, p.valor_total,
       p.taxa_comissao, p.taxa_servico, p.valor_liquido, p.data_pagamento, p.data_pedido,
       c.taxa_esperada,
       round(coalesce(p.taxa_comissao, 0) + coalesce(p.taxa_servico, 0) - coalesce(p.taxa_servico_afiliado, 0), 2) as taxa_real,
       round(coalesce(p.taxa_comissao, 0) + coalesce(p.taxa_servico, 0) - coalesce(p.taxa_servico_afiliado, 0) - c.taxa_esperada, 2) as taxa_diferenca
from public.pedidos p
join public.pedidos_taxa_esperada c on c.pedido_id = p.id
where p.marketplace = 'shopee' and p.escrow_atualizado_em is not null and coalesce(p.valor_total, 0) > 0;

-- Job horário já existente (pg_cron job 12, minuto 13): passa a alimentar o cache também.
create or replace function public.refresh_taxa_item()
returns void
language plpgsql
security definer
as $$
begin
  delete from taxa_item_cache where true;
  insert into taxa_item_cache (loja_id, item_id, taxa, vt)
  select p.loja_id, s.item_id,
    sum(coalesce(p.taxa_comissao,0) + coalesce(p.taxa_servico,0)) as taxa,
    sum(p.valor_total) as vt
  from (
    select pedido_id, min(item_id) as item_id
    from pedido_itens group by pedido_id having count(*) = 1
  ) s
  join pedidos p on p.id = s.pedido_id
  where p.escrow_atualizado_em is not null and p.valor_total > 0
  group by p.loja_id, s.item_id;
  perform public.refresh_taxa_esperada(20000);
end $$;

-- TikTok frete: "p_loja_ids is null or loja_id = any(...)" vira seq scan de 122 MB no plano
-- genérico; com coalesce o índice (loja_id, order_id) passa a ser usado. Mesma semântica.
create or replace function public.tiktok_frete_por_pedido(p_loja_ids uuid[] default null, p_inicio timestamptz default null, p_fim timestamptz default null)
returns table(loja_id uuid, order_id text, revenue numeric, frete_real numeric, subsidio numeric, pago_cliente numeric, devolucao numeric, estorno_cliente numeric, liquido numeric, motivo text)
language sql
stable
as $$
  with o as (
    select t.loja_id, t.order_id,
      sum(t.revenue) as revenue,
      sum(t.shipping_cost) as liquido,
      sum(-coalesce(nullif(t.breakdown->'shipping_cost_breakdown'->>'actual_shipping_fee_amount','')::numeric,0)) as frete_real,
      sum( coalesce(nullif(t.breakdown->'shipping_cost_breakdown'->>'shipping_fee_discount_amount','')::numeric,0)) as subsidio,
      sum( coalesce(nullif(t.breakdown->'shipping_cost_breakdown'->>'customer_paid_shipping_fee_amount','')::numeric,0)) as pago_cliente,
      sum(-coalesce(nullif(t.breakdown->'shipping_cost_breakdown'->>'return_shipping_fee_amount','')::numeric,0)) as devolucao,
      sum(-coalesce(nullif(t.breakdown->'shipping_cost_breakdown'->'supplementary_component'->>'refunded_customer_shipping_fee_amount','')::numeric,0)) as estorno_cliente
    from tiktok_transacoes t
    where t.tipo = 'ORDER' and t.order_id is not null
      and t.loja_id = any(coalesce(p_loja_ids, array(select id from lojas)))
      and (p_inicio is null or t.order_create_time >= p_inicio)
      and (p_fim is null or t.order_create_time < p_fim)
    group by 1,2
  )
  select loja_id, order_id, round(revenue,2), round(frete_real,2), round(subsidio,2), round(pago_cliente,2),
         round(devolucao,2), round(estorno_cliente,2), round(liquido,2),
         case when devolucao > 0 then 'devolucao'
              when revenue <= 0 or estorno_cliente > 0 then 'reembolso'
              when liquido > 0.005 then 'acima_subsidio'
              when liquido < -0.005 then 'credito'
              else 'zerado' end
  from o;
$$;
