-- resumo_pedidos (Dashboard) — OTIMIZADA para não estourar o timeout do anon.
-- Antes: CTE `filtrados as (select *)` reescaneada 9x (linhas gordas c/ dados_pedido).
-- Agora: passe único com FILTER + 3 agrupamentos, apoiada no índice de cobertura
-- pedidos_resumo_cov (ver supabase/dashboard.sql) -> index-only scan, sem heap.
-- 'por_marketplace' agrupa por LOJA (apelido). Rode no Supabase -> SQL Editor.

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
  with base as (
    select loja_id, marketplace, status, valor_total, pedido_efetivado, entra_faturamento,
           coalesce(data_pagamento, data_pedido) as data_ref
    from pedidos
    where (p_loja_ids is null or loja_id = any(p_loja_ids))
      and (p_inicio is null or coalesce(data_pagamento, data_pedido) >= p_inicio)
      and (p_fim is null or coalesce(data_pagamento, data_pedido) < p_fim)
  ),
  tot as (
    select count(*) as total_pedidos,
      count(*) filter (where pedido_efetivado) as pedidos_efetivados,
      count(*) filter (where entra_faturamento) as pedidos_faturados,
      count(*) filter (where coalesce(pedido_efetivado,false)=false and coalesce(status,'')<>'UNPAID') as pedidos_cancelados,
      coalesce(sum(valor_total),0) as faturamento_geral,
      coalesce(sum(valor_total) filter (where pedido_efetivado),0) as faturamento_efetivado,
      coalesce(sum(valor_total) filter (where entra_faturamento),0) as faturamento_concluido
    from base
  ),
  st as (select coalesce(json_agg(json_build_object('status',status,'quantidade',q) order by q desc),'[]'::json) j
    from (select coalesce(status,'UNKNOWN') as status, count(*)::int as q from base group by 1) x),
  mk as (select coalesce(json_agg(json_build_object('marketplace',loja,'faturamento',fat) order by fat desc),'[]'::json) j
    from (select coalesce(l.apelido,b.marketplace,'sem loja') as loja, coalesce(sum(b.valor_total),0) as fat
          from base b left join lojas l on l.id=b.loja_id where b.pedido_efetivado group by 1) x),
  vd as (select coalesce(json_agg(json_build_object('dia',dia,'faturamento',fat) order by dia),'[]'::json) j
    from (select to_char((data_ref at time zone 'America/Sao_Paulo')::date,'YYYY-MM-DD') as dia, coalesce(sum(valor_total),0) as fat
          from base where pedido_efetivado and data_ref is not null group by (data_ref at time zone 'America/Sao_Paulo')::date) x)
  select json_build_object(
    'total_pedidos',tot.total_pedidos,'pedidos_efetivados',tot.pedidos_efetivados,
    'pedidos_faturados',tot.pedidos_faturados,'pedidos_cancelados',tot.pedidos_cancelados,
    'faturamento_geral',tot.faturamento_geral,'faturamento_efetivado',tot.faturamento_efetivado,
    'faturamento_concluido',tot.faturamento_concluido,
    'por_status',st.j,'por_marketplace',mk.j,'vendas_por_dia',vd.j
  ) from tot,st,mk,vd;
$$;
grant execute on function resumo_pedidos(uuid[], timestamptz, timestamptz) to anon, authenticated;
