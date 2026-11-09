-- ============================================================================
-- ADS (nível loja/dia) — base do "Raio-X do Anúncio" Fase 1.
-- Guarda a performance diária de anúncios (get_all_cpc_ads_daily_performance):
-- gasto, GMV (direto/broad), pedidos, cliques, ROAS. `bruto` mantém a linha
-- crua da API (rede de segurança caso um campo mude de nome).
-- Rode no Supabase -> SQL Editor -> Run (seguro rodar de novo).
-- ============================================================================
create table if not exists ads_diario (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid references lojas(id),
  dia date not null,
  impressoes bigint,
  cliques bigint,
  ctr numeric,
  gasto numeric(14,2),
  pedidos_direto bigint,
  pedidos_broad bigint,
  gmv_direto numeric(14,2),
  gmv_broad numeric(14,2),
  roas_direto numeric,
  roas_broad numeric,
  bruto jsonb,
  atualizado_em timestamptz default now(),
  unique (loja_id, dia)
);
create index if not exists ads_diario_loja_dia_idx on ads_diario (loja_id, dia);

-- Resumo por loja (últimos p_dias): gasto, GMV/ROAS de Ads, receita total e
-- TACOS (gasto ÷ receita total). Usado na aba 📢 Ads.
create or replace function resumo_ads(p_loja_ids uuid[] default null, p_dias int default 30)
returns json language sql stable as $$
  with janela as (select ((now() at time zone 'America/Sao_Paulo')::date - p_dias) as ini),
  ads as (
    select a.loja_id,
      coalesce(sum(a.gasto),0) as gasto, coalesce(sum(a.gmv_direto),0) as gmv_direto,
      coalesce(sum(a.pedidos_direto),0) as ped_direto, coalesce(sum(a.cliques),0) as cliques,
      coalesce(sum(a.impressoes),0) as impressoes
    from ads_diario a, janela
    where a.dia >= janela.ini and (p_loja_ids is null or a.loja_id = any(p_loja_ids))
    group by a.loja_id
  ),
  rec as (
    select p.loja_id, coalesce(sum(p.valor_total),0) as receita
    from pedidos p, janela
    where p.marketplace='shopee' and p.pedido_efetivado
      and coalesce(p.data_pagamento,p.data_pedido) >= janela.ini
      and (p_loja_ids is null or p.loja_id = any(p_loja_ids))
    group by p.loja_id
  )
  select coalesce(json_agg(json_build_object(
    'loja', coalesce(l.nome_publico,l.apelido,l.nome),
    'gasto', ads.gasto, 'gmv_direto', ads.gmv_direto,
    'roas_direto', round((ads.gmv_direto/nullif(ads.gasto,0))::numeric,2),
    'receita', coalesce(rec.receita,0),
    'tacos', round((ads.gasto/nullif(rec.receita,0)*100)::numeric,2),
    'ped_direto', ads.ped_direto, 'cliques', ads.cliques, 'impressoes', ads.impressoes,
    'ctr', round((ads.cliques::numeric/nullif(ads.impressoes,0)*100),2)
  ) order by ads.gasto desc), '[]'::json)
  from ads left join rec on rec.loja_id=ads.loja_id left join lojas l on l.id=ads.loja_id;
$$;
grant execute on function resumo_ads(uuid[], int) to anon, authenticated;
