-- Resumo e lista de divergências de RECEBIMENTO sobre o PERÍODO INTEIRO
-- (antes a aba só olhava os 400 pedidos mais recentes). Só colunas do pedido
-- (sem JSON), então é leve.

-- KPIs do período: total, recebidos, a receber, divergentes (qtd e valor).
create or replace function resumo_conciliacao(
  p_loja_ids uuid[] default null,
  p_inicio timestamptz default null,
  p_fim timestamptz default null
)
returns json language sql stable as $$
  with base as (
    select coalesce(valor_liquido, valor_total) as esperado,
           coalesce(valor_recebido, 0) as recebido, recebido_em
    from pedidos
    where marketplace = 'shopee' and pedido_efetivado
      and (p_loja_ids is null or loja_id = any(p_loja_ids))
      and (p_inicio is null or data_pedido >= p_inicio)
      and (p_fim is null or data_pedido < p_fim)
  )
  select json_build_object(
    'total', count(*),
    'recebidos', count(*) filter (where recebido_em is not null),
    'a_receber', count(*) filter (where recebido_em is null),
    'divergentes', count(*) filter (where recebido_em is not null and abs(recebido - esperado) > 0.5),
    'diverg_valor', coalesce(sum(abs(recebido - esperado)) filter (where recebido_em is not null and abs(recebido - esperado) > 0.5), 0)
  ) from base;
$$;
grant execute on function resumo_conciliacao(uuid[], timestamptz, timestamptz) to anon, authenticated;

-- Lista das divergências de recebimento do período (maiores primeiro).
drop function if exists divergencias_recebimento(uuid[], timestamptz, timestamptz, int);
create or replace function divergencias_recebimento(
  p_loja_ids uuid[] default null,
  p_inicio timestamptz default null,
  p_fim timestamptz default null,
  p_limite int default 200
)
returns table(pedido_externo_id text, cliente_nome text, uf text, esperado numeric, recebido numeric, dif numeric, data_pedido timestamptz)
language sql stable as $$
  select pedido_externo_id, cliente_nome, uf,
    round(coalesce(valor_liquido, valor_total)::numeric, 2) as esperado,
    round(coalesce(valor_recebido, 0)::numeric, 2) as recebido,
    round((coalesce(valor_recebido, 0) - coalesce(valor_liquido, valor_total))::numeric, 2) as dif,
    data_pedido
  from pedidos
  where marketplace = 'shopee' and pedido_efetivado and recebido_em is not null
    and abs(coalesce(valor_recebido, 0) - coalesce(valor_liquido, valor_total)) > 0.5
    and (p_loja_ids is null or loja_id = any(p_loja_ids))
    and (p_inicio is null or data_pedido >= p_inicio)
    and (p_fim is null or data_pedido < p_fim)
  order by abs(coalesce(valor_recebido, 0) - coalesce(valor_liquido, valor_total)) desc
  limit p_limite;
$$;
grant execute on function divergencias_recebimento(uuid[], timestamptz, timestamptz, int) to anon, authenticated;
