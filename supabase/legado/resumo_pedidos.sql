-- Função de resumo do Dashboard: calcula TODOS os totais no banco (sem limite
-- de 1000 linhas), filtrando por loja e período de forma opcional.
--
-- Como aplicar:
--   1. Painel do Supabase -> SQL Editor -> New query
--   2. Cole TODO este arquivo e clique em "Run".
--   3. Pronto. O Dashboard passa a usar este modo (rápido e ilimitado).
--
-- É seguro rodar de novo: "create or replace" apenas atualiza a função.

-- Remove a versão antiga (sem p_fim), se existir, para não haver duplicidade.
drop function if exists resumo_pedidos(uuid, timestamptz);

create or replace function resumo_pedidos(
  p_loja_id uuid default null,
  p_inicio timestamptz default null,
  p_fim timestamptz default null
)
returns json
language sql
stable
as $$
  with filtrados as (
    select *,
           -- Data de referência: pagamento (igual ao "Pedidos Pagos" do
           -- Shopee); cai para a data de criação se o pagamento faltar.
           coalesce(data_pagamento, data_pedido) as data_ref
    from pedidos
    where (p_loja_id is null or loja_id = p_loja_id)
      and (p_inicio is null or coalesce(data_pagamento, data_pedido) >= p_inicio)
      and (p_fim is null or coalesce(data_pagamento, data_pedido) < p_fim)
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
         -- Agrupa por dia de pagamento no fuso de Brasília (igual ao Shopee).
         select to_char(
                  (data_ref at time zone 'America/Sao_Paulo')::date,
                  'YYYY-MM-DD'
                ) as dia,
                coalesce(sum(valor_total), 0) as faturamento
         from filtrados
         where pedido_efetivado and data_ref is not null
         group by (data_ref at time zone 'America/Sao_Paulo')::date
       ) v)
  );
$$;

-- Permite que o app (chave anônima) chame a função.
grant execute on function resumo_pedidos(uuid, timestamptz, timestamptz) to anon, authenticated;
