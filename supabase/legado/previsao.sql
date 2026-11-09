-- ============================================================================
-- PREVISÃO DE FLUXO DE CAIXA
-- Calcula a média real de dias entre o pedido e o dinheiro cair na carteira
-- (geral e por UF), e projeta quando os pedidos EM ABERTO vão pagar.
-- Rode no Supabase -> SQL Editor -> Run (seguro rodar de novo).
-- ============================================================================
drop function if exists previsao_fluxo_caixa(uuid[], int);
create or replace function previsao_fluxo_caixa(
  p_loja_ids uuid[] default null,
  p_dias int default 30
)
returns json
language sql
stable
as $$
  with recebidos as (
    -- histórico: quantos dias levou entre o pedido e cair na carteira
    select uf, extract(epoch from (recebido_em - data_pedido)) / 86400.0 as lag
    from pedidos
    where marketplace = 'shopee'
      and recebido_em is not null and data_pedido is not null
      and (p_loja_ids is null or loja_id = any(p_loja_ids))
  ),
  media_geral as (
    select coalesce(avg(lag), 7) as m from recebidos where lag between 0 and 90
  ),
  media_uf as (
    select uf, avg(lag) as m, count(*) as q
    from recebidos where lag between 0 and 90 group by uf
  ),
  abertos as (
    -- pedidos efetivados que ainda não caíram na carteira
    select coalesce(p.valor_liquido, p.valor_total) as valor,
           p.data_pedido,
           coalesce(
             (select mu.m from media_uf mu where mu.uf = p.uf and mu.q >= 5),
             (select m from media_geral)
           ) as lag_prev
    from pedidos p
    where p.marketplace = 'shopee' and p.pedido_efetivado
      and p.recebido_em is null and p.data_pedido is not null
      and p.data_pedido >= now() - interval '45 days'  -- só pendências recentes
      and (p_loja_ids is null or p.loja_id = any(p_loja_ids))
  ),
  previsto as (
    select (data_pedido + (round(lag_prev)::int * interval '1 day')) as data_prev, valor
    from abertos
  ),
  hoje as (select (now() at time zone 'America/Sao_Paulo')::date as d),
  por_dia as (
    select (data_prev at time zone 'America/Sao_Paulo')::date as dia,
           sum(valor) as valor, count(*) as pedidos
    from previsto, hoje
    where (data_prev at time zone 'America/Sao_Paulo')::date >= hoje.d
      and (data_prev at time zone 'America/Sao_Paulo')::date < hoje.d + p_dias
    group by 1
  ),
  atrasado as (
    select coalesce(sum(valor), 0) as valor, count(*) as pedidos
    from previsto, hoje
    where (data_prev at time zone 'America/Sao_Paulo')::date < hoje.d
  )
  select json_build_object(
    'media_geral_dias', (select round(m::numeric, 1) from media_geral),
    'base_amostra',     (select count(*) from recebidos where lag between 0 and 90),
    'total_a_receber',  (select coalesce(sum(valor), 0) from abertos),
    'qtd_a_receber',    (select count(*) from abertos),
    'atrasado_valor',   (select valor from atrasado),
    'atrasado_pedidos', (select pedidos from atrasado),
    'proximos_dias',    (select coalesce(json_agg(
                            json_build_object('dia', to_char(dia, 'YYYY-MM-DD'), 'valor', valor, 'pedidos', pedidos)
                            order by dia), '[]'::json) from por_dia),
    'por_uf',           (select coalesce(json_agg(
                            json_build_object('uf', uf, 'dias', round(m::numeric, 1), 'amostra', q)
                            order by q desc), '[]'::json) from media_uf where q >= 5)
  );
$$;
grant execute on function previsao_fluxo_caixa(uuid[], int) to anon, authenticated;
