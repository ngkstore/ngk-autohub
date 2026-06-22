-- Função de resumo do Dashboard: calcula TODOS os totais no banco (sem limite
-- de 1000 linhas), filtrando por loja e período de forma opcional.
--
-- Como aplicar:
--   1. Painel do Supabase -> SQL Editor -> New query
--   2. Cole TODO este arquivo e clique em "Run".
--   3. Pronto. O Dashboard passa a usar este modo (rápido e ilimitado).
--
-- É seguro rodar de novo: "create or replace" apenas atualiza a função.

create or replace function resumo_pedidos(
  p_loja_id uuid default null,
  p_inicio timestamptz default null
)
returns json
language sql
stable
as $$
  with filtrados as (
    select *
    from pedidos
    where (p_loja_id is null or loja_id = p_loja_id)
      and (p_inicio is null or data_pedido >= p_inicio)
  )
  select json_build_object(
    'total_pedidos',
      (select count(*) from filtrados),

    'pedidos_efetivados',
      (select count(*) from filtrados where pedido_efetivado),

    'pedidos_faturados',
      (select count(*) from filtrados where entra_faturamento),

    'pedidos_cancelados',
      (select count(*) from filtrados
        where coalesce(pedido_efetivado, false) = false
          and coalesce(status, '') <> 'UNPAID'),

    'faturamento_geral',
      (select coalesce(sum(valor_total), 0) from filtrados),

    'faturamento_efetivado',
      (select coalesce(sum(valor_total), 0) from filtrados where pedido_efetivado),

    'faturamento_concluido',
      (select coalesce(sum(valor_total), 0) from filtrados where entra_faturamento),

    'por_status',
      (select coalesce(
        json_agg(
          json_build_object('status', status, 'quantidade', quantidade)
          order by quantidade desc
        ), '[]'::json)
       from (
         select coalesce(status, 'UNKNOWN') as status, count(*)::int as quantidade
         from filtrados
         group by coalesce(status, 'UNKNOWN')
       ) s),

    'por_marketplace',
      (select coalesce(
        json_agg(
          json_build_object('marketplace', marketplace, 'faturamento', faturamento)
        ), '[]'::json)
       from (
         select coalesce(marketplace, 'sem marketplace') as marketplace,
                coalesce(sum(valor_total), 0) as faturamento
         from filtrados
         where pedido_efetivado
         group by coalesce(marketplace, 'sem marketplace')
       ) m),

    'vendas_por_dia',
      (select coalesce(
        json_agg(
          json_build_object('dia', dia, 'faturamento', faturamento)
          order by dia
        ), '[]'::json)
       from (
         -- Agrupa por dia no fuso de Brasília, para bater com o Shopee.
         select to_char(
                  (data_pedido at time zone 'America/Sao_Paulo')::date,
                  'YYYY-MM-DD'
                ) as dia,
                coalesce(sum(valor_total), 0) as faturamento
         from filtrados
         where pedido_efetivado and data_pedido is not null
         group by (data_pedido at time zone 'America/Sao_Paulo')::date
       ) v)
  );
$$;

-- Permite que o app (chave anônima) chame a função.
grant execute on function resumo_pedidos(uuid, timestamptz) to anon, authenticated;
