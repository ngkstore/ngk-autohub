-- auditoria_resumo passa a aceitar VÁRIAS lojas (p_loja_ids uuid[]), pra bater
-- com o escopo por conta do hub /financas. Mesmo cálculo de antes.
drop function if exists auditoria_resumo(uuid, timestamptz, timestamptz);

create or replace function auditoria_resumo(
  p_loja_ids uuid[] default null,
  p_inicio timestamptz default null,
  p_fim timestamptz default null
)
returns json
language sql
stable
as $$
  with base as (
    select *
    from pedidos_auditoria
    where (p_loja_ids is null or loja_id = any(p_loja_ids))
      and (p_inicio is null or coalesce(data_pagamento, data_pedido) >= p_inicio)
      and (p_fim is null or coalesce(data_pagamento, data_pedido) < p_fim)
  )
  select json_build_object(
    'pedidos', (select count(*) from base),
    'divergentes', (select count(*) from base where abs(taxa_diferenca) > 0.50),
    'taxa_esperada_total', (select coalesce(sum(taxa_esperada), 0) from base),
    'taxa_real_total', (select coalesce(sum(taxa_real), 0) from base),
    'diferenca_total', (select coalesce(sum(taxa_diferenca), 0) from base),
    'cobrado_a_mais', (select coalesce(sum(taxa_diferenca) filter (where taxa_diferenca > 0), 0) from base),
    'cobrado_a_menos', (select coalesce(sum(taxa_diferenca) filter (where taxa_diferenca < 0), 0) from base)
  );
$$;
grant execute on function auditoria_resumo(uuid[], timestamptz, timestamptz) to anon, authenticated;
