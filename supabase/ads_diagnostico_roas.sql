-- Diagnóstico semanal do ROAS (GMV Max): POR QUE o ROAS geral subiu ou caiu.
-- Compara os últimos p_dias dias COMPLETOS (até ontem) com os p_dias anteriores e
-- decompõe a variação por item:
--   contrib_i = (gmv_i − ROAS_anterior × gasto_i) / gasto_total_atual
-- A soma das contribuições é EXATAMENTE ROAS_atual − ROAS_anterior. Cada contribuição
-- se divide em:
--   eficiência = gasto_i × (ROAS_i atual − ROAS_i anterior) / gasto_total  (o próprio item piorou/melhorou)
--   mix        = contrib − eficiência                                     (o gasto migrou pra itens acima/abaixo da média)
-- Traz também CTR / conversão / CPC dos dois períodos, as alterações de meta/orçamento/
-- status detectadas na janela (ads_alteracoes) e a recomendação mais recente do motor.
-- Usado pelo relatório semanal (Telegram, segunda) e pela página /ads-controle.
create or replace function ads_diagnostico_roas(p_loja_ids uuid[] default null, p_dias int default 7)
returns json language sql stable as $$
  with hoje as (select (now() at time zone 'America/Sao_Paulo')::date d),
  jan as (
    select d - 1 as fim_atual, d - p_dias as ini_atual,
           d - p_dias - 1 as fim_ant, d - 2 * p_dias as ini_ant
    from hoje
  ),
  perf as (
    select f.loja_id, f.item_id, f.dia,
      coalesce(f.gasto, 0) gasto, coalesce(f.gmv, 0) gmv,
      coalesce(f.impressoes, 0) imp, coalesce(f.cliques, 0) cli, coalesce(f.pedidos, 0) ped,
      (f.dia >= jan.ini_atual) as atual
    from ads_item_performance_daily f, jan
    where f.escopo = 'direto' and f.dia between jan.ini_ant and jan.fim_atual
      and (p_loja_ids is null or f.loja_id = any(p_loja_ids))
  ),
  por_item as (
    select loja_id, item_id,
      coalesce(sum(gasto) filter (where atual), 0) gasto_a, coalesce(sum(gmv) filter (where atual), 0) gmv_a,
      coalesce(sum(imp) filter (where atual), 0) imp_a, coalesce(sum(cli) filter (where atual), 0) cli_a,
      coalesce(sum(ped) filter (where atual), 0) ped_a,
      coalesce(sum(gasto) filter (where not atual), 0) gasto_p, coalesce(sum(gmv) filter (where not atual), 0) gmv_p,
      coalesce(sum(imp) filter (where not atual), 0) imp_p, coalesce(sum(cli) filter (where not atual), 0) cli_p,
      coalesce(sum(ped) filter (where not atual), 0) ped_p
    from perf
    group by 1, 2
  ),
  tot as (
    select coalesce(sum(gasto_a), 0) ga, coalesce(sum(gmv_a), 0) gma,
           coalesce(sum(gasto_p), 0) gp, coalesce(sum(gmv_p), 0) gmp
    from por_item
  ),
  rec as (
    select distinct on (r.loja_id, r.item_id)
      r.loja_id, r.item_id, r.produto, r.classificacao, r.acao, r.meta_roas, r.meta_sugerida,
      r.roas_minimo, r.fator, r.promo, r.orcamento_configurado, r.orcamento_ideal
    from ads_recomendacoes r
    where (p_loja_ids is null or r.loja_id = any(p_loja_ids))
    order by r.loja_id, r.item_id, r.dia desc
  ),
  alt as (
    select a.loja_id, a.item_id,
      json_agg(json_build_object('dia', a.data_deteccao, 'campo', a.campo, 'de', a.valor_antigo, 'para', a.valor_novo)
               order by a.data_deteccao) as alteracoes
    from ads_alteracoes a, jan
    where a.item_id is not null
      and a.data_deteccao between jan.ini_ant and jan.fim_atual + 1
      and (p_loja_ids is null or a.loja_id = any(p_loja_ids))
    group by 1, 2
  ),
  calc as (
    select p.*,
      p.gmv_a / nullif(p.gasto_a, 0) as roas_a,
      p.gmv_p / nullif(p.gasto_p, 0) as roas_p,
      (p.gmv_a - coalesce(t.gmp / nullif(t.gp, 0), 0) * p.gasto_a) / nullif(t.ga, 0) as contrib,
      case when p.gasto_p > 0 and p.gasto_a > 0
           then p.gasto_a * (p.gmv_a / p.gasto_a - p.gmv_p / p.gasto_p) / nullif(t.ga, 0)
           else 0 end as contrib_efic
    from por_item p, tot t
  ),
  itens as (
    select c.loja_id, c.item_id,
      coalesce(r.produto, pr.nome) as produto,
      round(c.gasto_a::numeric, 2) gasto_atual, round(c.gasto_p::numeric, 2) gasto_anterior,
      round(c.gmv_a::numeric, 2) gmv_atual, round(c.gmv_p::numeric, 2) gmv_anterior,
      round(c.roas_a::numeric, 2) roas_atual, round(c.roas_p::numeric, 2) roas_anterior,
      round((c.cli_a::numeric / nullif(c.imp_a, 0)), 4) ctr_atual, round((c.cli_p::numeric / nullif(c.imp_p, 0)), 4) ctr_anterior,
      round((c.ped_a::numeric / nullif(c.cli_a, 0)), 4) cr_atual, round((c.ped_p::numeric / nullif(c.cli_p, 0)), 4) cr_anterior,
      round((c.gasto_a / nullif(c.cli_a, 0))::numeric, 2) cpc_atual, round((c.gasto_p / nullif(c.cli_p, 0))::numeric, 2) cpc_anterior,
      c.ped_a pedidos_atual, c.ped_p pedidos_anterior,
      round(coalesce(c.contrib, 0)::numeric, 3) contrib,
      round(coalesce(c.contrib_efic, 0)::numeric, 3) contrib_efic,
      round((coalesce(c.contrib, 0) - coalesce(c.contrib_efic, 0))::numeric, 3) contrib_mix,
      r.classificacao, r.acao, r.meta_roas, r.meta_sugerida, r.roas_minimo, r.fator,
      coalesce(r.promo, false) promo, r.orcamento_configurado, r.orcamento_ideal,
      coalesce(a.alteracoes, '[]'::json) alteracoes
    from calc c
    left join rec r on r.loja_id = c.loja_id and r.item_id = c.item_id
    left join produtos pr on pr.loja_id = c.loja_id and pr.item_id::text = c.item_id::text
    left join alt a on a.loja_id = c.loja_id and a.item_id = c.item_id
    where c.gasto_a > 0 or c.gasto_p > 0
  )
  select json_build_object(
    'periodo', (select json_build_object('atual_ini', ini_atual, 'atual_fim', fim_atual,
                                         'ant_ini', ini_ant, 'ant_fim', fim_ant, 'dias', p_dias) from jan),
    'atual',    (select json_build_object('gasto', round(ga::numeric, 2), 'gmv', round(gma::numeric, 2),
                                          'roas', round((gma / nullif(ga, 0))::numeric, 2)) from tot),
    'anterior', (select json_build_object('gasto', round(gp::numeric, 2), 'gmv', round(gmp::numeric, 2),
                                          'roas', round((gmp / nullif(gp, 0))::numeric, 2)) from tot),
    'delta_roas', (select round((gma / nullif(ga, 0) - gmp / nullif(gp, 0))::numeric, 2) from tot),
    'itens', (select coalesce(json_agg(i), '[]'::json)
              from (select * from itens order by abs(contrib) desc limit 80) i)
  );
$$;
grant execute on function ads_diagnostico_roas(uuid[], int) to anon, authenticated;
