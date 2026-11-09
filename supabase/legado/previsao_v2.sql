-- Previsão v2: "atrasado" passa a usar o p90 (prazo em que 90% dos pedidos já
-- foram recebidos) em vez da MÉDIA — antes quase metade caía como "atrasado"
-- só por passar da média. Agora só conta o que passou do p90 = genuinamente
-- atrasado. Também expõe p90_dias e devolve por_uf com qualquer amostra (o
-- componente completa os 27 estados).
create or replace function previsao_fluxo_caixa(p_loja_ids uuid[] default null, p_dias int default 30)
returns json language sql stable as $$
  with lg as (
    select uf, avg(media_dias) as media_dias, sum(amostra)::int as amostra
    from previsao_lag where (p_loja_ids is null or loja_id = any(p_loja_ids)) group by uf
  ),
  geral as (select media_dias, amostra from lg where uf = 'GERAL'),
  p90 as (
    select percentile_cont(0.9) within group (order by lag) as p90d
    from (
      select extract(epoch from (recebido_em - data_pedido)) / 86400.0 as lag
      from pedidos
      where marketplace = 'shopee' and recebido_em is not null and data_pedido is not null
        and (p_loja_ids is null or loja_id = any(p_loja_ids))
    ) x
    where lag between 0 and 90
  ),
  hoje as (select (now() at time zone 'America/Sao_Paulo')::date as d),
  abertos as (
    select f.dia, f.uf, f.a_receber as valor, f.qtd_a_receber as qtd,
      coalesce((select round(l.media_dias) from lg l where l.uf = f.uf and l.amostra >= 5),
               (select round(media_dias) from geral), 7) as lag
    from financas_resumo_diario f
    where (p_loja_ids is null or f.loja_id = any(p_loja_ids)) and f.a_receber > 0
  ),
  previsto as (
    select (dia + lag::int) as data_prev,
           (dia + (select round(p90d)::int from p90)) as data_prev_p90,
           valor, qtd
    from abertos
  ),
  por_dia as (
    select data_prev as diap, sum(valor) as valor, sum(qtd)::int as pedidos
    from previsto, hoje
    where data_prev >= hoje.d and data_prev < hoje.d + p_dias group by 1
  ),
  atrasado as (
    select coalesce(sum(valor), 0) as valor, coalesce(sum(qtd), 0)::int as pedidos
    from previsto, hoje where data_prev_p90 < hoje.d
  )
  select json_build_object(
    'media_geral_dias', (select round(media_dias::numeric, 1) from geral),
    'p90_dias', (select round(p90d::numeric, 1) from p90),
    'base_amostra', (select amostra from geral),
    'total_a_receber', (select coalesce(sum(valor), 0) from abertos),
    'qtd_a_receber', (select coalesce(sum(qtd), 0)::int from abertos),
    'atrasado_valor', (select valor from atrasado),
    'atrasado_pedidos', (select pedidos from atrasado),
    'proximos_dias', (select coalesce(json_agg(json_build_object('dia', to_char(diap, 'YYYY-MM-DD'), 'valor', valor, 'pedidos', pedidos) order by diap), '[]'::json) from por_dia),
    'por_uf', (select coalesce(json_agg(json_build_object('uf', uf, 'dias', round(media_dias::numeric, 1), 'amostra', amostra) order by media_dias asc), '[]'::json) from lg where uf <> 'GERAL' and amostra >= 1)
  );
$$;
grant execute on function previsao_fluxo_caixa(uuid[], int) to anon, authenticated;
