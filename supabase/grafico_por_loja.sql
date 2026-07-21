-- Gráfico "faturamento por marketplace" agora separa por LOJA (apelido),
-- em vez de agrupar todas as Shopee numa barra só.
-- Recria a função resumo_pedidos com essa única mudança (o 'por_marketplace'
-- passa a agrupar por lojas.apelido). Rode no Supabase -> SQL Editor -> Run.

drop function if exists resumo_pedidos(uuid[], timestamptz, timestamptz);
create or replace function resumo_pedidos(
  p_loja_ids uuid[] default null,
  p_inicio timestamptz default null,
  p_fim timestamptz default null
)
returns json
language sql
stable
as $$
  with filtrados as (
    select *,
           coalesce(data_pagamento, data_pedido) as data_ref
    from pedidos
    where (p_loja_ids is null or loja_id = any(p_loja_ids))
      and (p_inicio is null or coalesce(data_pagamento, data_pedido) >= p_inicio)
      and (p_fim is null or coalesce(data_pagamento, data_pedido) < p_fim)
  )
  select json_build_object(
    'total_pedidos', (select count(*) from filtrados),
    'pedidos_efetivados', (select count(*) from filtrados where pedido_efetivado),
    'pedidos_faturados', (select count(*) from filtrados where entra_faturamento),
    'pedidos_cancelados', (select count(*) from filtrados
        where coalesce(pedido_efetivado, false) = false
          and coalesce(status, '') <> 'UNPAID'),
    'faturamento_geral', (select coalesce(sum(valor_total), 0) from filtrados),
    'faturamento_efetivado', (select coalesce(sum(valor_total), 0) from filtrados where pedido_efetivado),
    'faturamento_concluido', (select coalesce(sum(valor_total), 0) from filtrados where entra_faturamento),
    'por_status', (select coalesce(json_agg(
          json_build_object('status', status, 'quantidade', quantidade)
          order by quantidade desc), '[]'::json)
       from (select coalesce(status, 'UNKNOWN') as status, count(*)::int as quantidade
         from filtrados group by coalesce(status, 'UNKNOWN')) s),
    -- AGORA por LOJA (apelido), não por marketplace.
    'por_marketplace', (select coalesce(json_agg(
          json_build_object('marketplace', loja, 'faturamento', faturamento)
          order by faturamento desc), '[]'::json)
       from (select coalesce(l.apelido, f.marketplace, 'sem loja') as loja,
                coalesce(sum(f.valor_total), 0) as faturamento
         from filtrados f
         left join lojas l on l.id = f.loja_id
         where f.pedido_efetivado
         group by coalesce(l.apelido, f.marketplace, 'sem loja')) m),
    'vendas_por_dia', (select coalesce(json_agg(
          json_build_object('dia', dia, 'faturamento', faturamento)
          order by dia), '[]'::json)
       from (select to_char((data_ref at time zone 'America/Sao_Paulo')::date, 'YYYY-MM-DD') as dia,
                coalesce(sum(valor_total), 0) as faturamento
         from filtrados where pedido_efetivado and data_ref is not null
         group by (data_ref at time zone 'America/Sao_Paulo')::date) v)
  );
$$;
grant execute on function resumo_pedidos(uuid[], timestamptz, timestamptz) to anon, authenticated;
