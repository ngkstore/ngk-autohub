-- 09/11/2026 — auditoria_resumo fazia "select *" da view num CTE lido 7 vezes (obrigava a
-- ler a linha inteira de pedidos); vira um passe único com agregados filtrados.
-- refresh_taxa_esperada: escolhe os candidatos pelo índice coberto antes de abrir o jsonb.
set statement_timeout = '10min';

create or replace function public.auditoria_resumo(p_loja_ids uuid[] default null, p_inicio timestamptz default null, p_fim timestamptz default null)
returns json
language sql
stable
as $$
  select json_build_object(
    'pedidos', count(*),
    'divergentes', count(*) filter (where abs(taxa_diferenca) > 0.50),
    'taxa_esperada_total', coalesce(sum(taxa_esperada), 0),
    'taxa_real_total', coalesce(sum(taxa_real), 0),
    'diferenca_total', coalesce(sum(taxa_diferenca), 0),
    'cobrado_a_mais', coalesce(sum(taxa_diferenca) filter (where taxa_diferenca > 0), 0),
    'cobrado_a_menos', coalesce(sum(taxa_diferenca) filter (where taxa_diferenca < 0), 0)
  )
  from (
    select taxa_esperada, taxa_real, taxa_diferenca
    from public.pedidos_auditoria
    where (p_loja_ids is null or loja_id = any(p_loja_ids))
      and (p_inicio is null or coalesce(data_pagamento, data_pedido) >= p_inicio)
      and (p_fim is null or coalesce(data_pagamento, data_pedido) < p_fim)
  ) base;
$$;

create or replace function public.refresh_taxa_esperada(p_limite integer default 20000)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_n integer;
begin
  with cand as materialized (
    select p.id
    from public.pedidos p
    where p.marketplace = 'shopee' and p.escrow_atualizado_em is not null
      and coalesce(p.valor_total, 0) > 0
      and not exists (select 1 from public.pedidos_taxa_esperada c where c.pedido_id = p.id)
    order by p.data_pedido desc nulls last
    limit p_limite
  ),
  src as (
    select p.id, p.loja_id, p.data_pedido, p.dados_pedido
    from cand join public.pedidos p on p.id = cand.id
    where jsonb_typeof(p.dados_pedido -> 'item_list') = 'array'
  )
  insert into public.pedidos_taxa_esperada (pedido_id, loja_id, taxa_esperada)
  select p.id, p.loja_id, coalesce(esp.taxa_esperada, 0)
  from src p
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
