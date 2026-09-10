-- FASE 3: resumo do controle de Ads GMV Max (alimenta a página /ads-controle e
-- serve de base pro relatório semanal). Tendência de ROAS da loja + contagem por
-- classificação + gasto em risco + saldo (em dias de gasto) + alertas.
create or replace function ads_resumo_controle(p_loja_ids uuid[] default null)
returns json language sql stable as $$
  with hoje as (select (now() at time zone 'America/Sao_Paulo')::date d),
  perf as (
    select dia, gasto, gmv from ads_item_performance_daily, hoje
    where escopo='direto' and (p_loja_ids is null or loja_id = any(p_loja_ids))
      and dia >= hoje.d - 28
  ),
  roas as (
    select
      round((sum(gmv) filter (where dia >= (select d from hoje)-7) / nullif(sum(gasto) filter (where dia >= (select d from hoje)-7),0))::numeric,1) as semana,
      round((sum(gmv) filter (where dia >= (select d from hoje)-14 and dia < (select d from hoje)-7) / nullif(sum(gasto) filter (where dia >= (select d from hoje)-14 and dia < (select d from hoje)-7),0))::numeric,1) as anterior,
      round((sum(gmv) / nullif(sum(gasto),0))::numeric,1) as media4s,
      round(sum(gasto) filter (where dia >= (select d from hoje)-7)::numeric,2) as gasto_semana,
      round((sum(gasto)/28.0)::numeric,2) as gasto_medio_dia
    from perf
  ),
  rec as (
    select classificacao, count(*) qtd, round(sum(gasto_7d)::numeric,0) gasto
    from ads_recomendacoes, hoje
    where dia = hoje.d and (p_loja_ids is null or loja_id = any(p_loja_ids))
    group by 1
  ),
  saldo as (
    select round(sum(s.saldo)::numeric,2) as total from ads_saldo_diario s, hoje
    where s.dia = (select max(dia) from ads_saldo_diario) and (p_loja_ids is null or s.loja_id = any(p_loja_ids))
  )
  select json_build_object(
    'roas_semana', (select semana from roas),
    'roas_anterior', (select anterior from roas),
    'roas_media4s', (select media4s from roas),
    'gasto_semana', (select gasto_semana from roas),
    'gasto_medio_dia', (select gasto_medio_dia from roas),
    'saldo', (select total from saldo),
    'saldo_dias', round(((select total from saldo) / nullif((select gasto_medio_dia from roas),0))::numeric,1),
    'por_classificacao', (select coalesce(json_agg(json_build_object('classificacao',classificacao,'qtd',qtd,'gasto',gasto) order by gasto desc),'[]'::json) from rec),
    'gasto_risco', coalesce((select gasto from rec where classificacao='abaixo_do_minimo'),0),
    'itens_aprendizado', coalesce((select qtd from rec where classificacao='aprendizado'),0)
  );
$$;
grant execute on function ads_resumo_controle(uuid[]) to anon, authenticated;
