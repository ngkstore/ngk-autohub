-- resumo_ads por INTERVALO de datas (pra filtrar por mês específico, não só
-- "últimos N dias"). Convive com a versão antiga (uuid[], int). gasto/GMV/ROAS
-- vêm da API de Ads (ads_diario); receita = faturamento EFETIVO real (pedidos
-- pagos) — TACOS = gasto ÷ receita real.
create or replace function resumo_ads(p_loja_ids uuid[] default null, p_ini date default null, p_fim date default null)
returns json language sql stable as $$
  with ads as (
    select a.loja_id,
      coalesce(sum(a.gasto), 0) as gasto, coalesce(sum(a.gmv_direto), 0) as gmv_direto,
      coalesce(sum(a.pedidos_direto), 0) as ped_direto, coalesce(sum(a.cliques), 0) as cliques,
      coalesce(sum(a.impressoes), 0) as impressoes
    from ads_diario a
    where (p_ini is null or a.dia >= p_ini) and (p_fim is null or a.dia <= p_fim)
      and (p_loja_ids is null or a.loja_id = any(p_loja_ids))
    group by a.loja_id
  ),
  rec as (
    select p.loja_id, coalesce(sum(p.valor_total), 0) as receita
    from pedidos p
    where p.marketplace = 'shopee' and p.pedido_efetivado
      and (p_ini is null or (coalesce(p.data_pagamento, p.data_pedido) at time zone 'America/Sao_Paulo')::date >= p_ini)
      and (p_fim is null or (coalesce(p.data_pagamento, p.data_pedido) at time zone 'America/Sao_Paulo')::date <= p_fim)
      and (p_loja_ids is null or p.loja_id = any(p_loja_ids))
    group by p.loja_id
  )
  select coalesce(json_agg(json_build_object(
    'loja', coalesce(l.nome_publico, l.apelido, l.nome),
    'gasto', ads.gasto, 'gmv_direto', ads.gmv_direto,
    'roas_direto', round((ads.gmv_direto / nullif(ads.gasto, 0))::numeric, 2),
    'roas_efetivo', round((coalesce(rec.receita, 0) / nullif(ads.gasto, 0))::numeric, 2),
    'receita', coalesce(rec.receita, 0),
    'tacos', round((ads.gasto / nullif(rec.receita, 0) * 100)::numeric, 2),
    'ped_direto', ads.ped_direto, 'cliques', ads.cliques, 'impressoes', ads.impressoes,
    'ctr', round((ads.cliques::numeric / nullif(ads.impressoes, 0) * 100), 2)
  ) order by ads.gasto desc), '[]'::json)
  from ads left join rec on rec.loja_id = ads.loja_id left join lojas l on l.id = ads.loja_id;
$$;
grant execute on function resumo_ads(uuid[], date, date) to anon, authenticated;
