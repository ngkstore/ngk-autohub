-- FASE 2 refinada: motor de regras COMPLETO (§6 da spec) + flag de promoção +
-- alerta de ROAS despencando 3 dias. Substitui ads_recomendacoes_calc.
--
-- Regras (ordem): 1 aprendizado (<14d) · 2 abaixo_do_minimo · 3 problema_anuncio
-- (CTR MM7 < 0,8×MM28 c/ CR estável) · 4 problema_pagina (CR MM7 < 0,8×MM28 c/
-- CTR estável) · 5 meta_nao_entregue (ROAS Shopee MM7 < 0,7×meta) · 6 campeao
-- (ROAS real ≥ 1,3×mín; SUPRIMIDA em promoção) · 7 meta_desalinhada (>15%) ·
-- 8 saudavel. Promo = preço médio vendido 7d < 0,95× preço médio dos 28d antes.

alter table ads_recomendacoes add column if not exists promo boolean default false;
alter table ads_recomendacoes add column if not exists alerta_roas boolean default false;
alter table ads_recomendacoes add column if not exists ctr_7d numeric(8,4);
alter table ads_recomendacoes add column if not exists ctr_28d numeric(8,4);
alter table ads_recomendacoes add column if not exists cr_7d numeric(8,4);
alter table ads_recomendacoes add column if not exists cr_28d numeric(8,4);

create or replace function ads_recomendacoes_calc(p_loja_ids uuid[] default null, p_meta_global numeric default 30)
returns int language plpgsql security definer as $$
declare v_hoje date := (now() at time zone 'America/Sao_Paulo')::date; v_n int;
begin
  delete from ads_recomendacoes where dia = v_hoje and (p_loja_ids is null or loja_id = any(p_loja_ids));

  with perf as (  -- MM7 e MM28 (escopo direto)
    select loja_id, item_id, max(campaign_id) as campaign_id,
      sum(gasto)      filter (where dia >= v_hoje-7)  as gasto7,
      sum(gmv)        filter (where dia >= v_hoje-7)  as gmv7,
      sum(pedidos)    filter (where dia >= v_hoje-7)  as ped7,
      sum(cliques)    filter (where dia >= v_hoje-7)  as cli7,
      sum(impressoes) filter (where dia >= v_hoje-7)  as imp7,
      sum(pedidos)    as ped28, sum(cliques) as cli28, sum(impressoes) as imp28
    from ads_item_performance_daily
    where escopo='direto' and dia >= v_hoje-28
      and (p_loja_ids is null or loja_id = any(p_loja_ids))
    group by 1,2
  ),
  fator_item as (
    select pi.loja_id, pi.item_id::bigint as item_id,
      sum(pi.qtd*pi.preco) filter (where p.pedido_efetivado) as efet,
      sum(pi.qtd*pi.preco) as bruto, count(distinct p.id) as pedidos_base
    from pedido_itens pi join pedidos p on p.id = pi.pedido_id
    where p.data_pedido >= now() - interval '90 days'
      and (p_loja_ids is null or pi.loja_id = any(p_loja_ids))
    group by 1,2
  ),
  fator_loja as (select loja_id, sum(efet)/nullif(sum(bruto),0) as f from fator_item group by 1),
  custo_item as (
    select pi.loja_id, pi.item_id::bigint as item_id, avg(cv.custo) as custo
    from pedido_itens pi
    join custos_variacao cv on cv.loja_id=pi.loja_id and norm_sku(cv.model_sku)=norm_sku(pi.model_sku)
    where (p_loja_ids is null or pi.loja_id = any(p_loja_ids))
    group by 1,2
  ),
  -- Promoção: preço médio vendido nos últimos 7d vs os 28d anteriores (8-35d).
  preco_item as (
    select loja_id, item_id::bigint as item_id,
      sum(qtd*preco) filter (where dia >= v_hoje-7)  / nullif(sum(qtd) filter (where dia >= v_hoje-7),0)  as p7,
      sum(qtd*preco) filter (where dia <  v_hoje-7)  / nullif(sum(qtd) filter (where dia <  v_hoje-7),0)  as p28
    from pedido_itens
    where dia >= v_hoje-35 and (p_loja_ids is null or loja_id = any(p_loja_ids))
    group by 1,2
  ),
  cfg as (
    select distinct on (loja_id, item_id) loja_id, item_id, campaign_id, meta_roas, orcamento, data_inicio, status
    from ads_campaign_config_daily
    where dia = (select max(dia) from ads_campaign_config_daily)
      and item_id is not null and status in ('ongoing','paused')
    order by loja_id, item_id, dia desc
  ),
  base as (
    select p.loja_id, p.item_id, coalesce(p.campaign_id, cfg.campaign_id) as campaign_id,
      p.gasto7, p.gmv7,
      case when p.gasto7>0 then p.gmv7/p.gasto7 else 0 end as roas_shopee,
      coalesce(case when fi.pedidos_base >= 20 and fi.bruto>0 then fi.efet/fi.bruto end, fl.f, 1) as fator,
      coalesce((select round(100.0*ti.taxa/nullif(ti.vt,0),1) from taxa_item_cache ti
                where ti.loja_id=p.loja_id and ti.item_id=p.item_id::text and ti.vt>0), 14) as taxa_pct,
      ci.custo,
      case when p.ped7>0 then p.gmv7/p.ped7 end as ticket,
      case when p.imp7>0 then p.cli7::numeric/p.imp7 end as ctr7,
      case when p.imp28>0 then p.cli28::numeric/p.imp28 end as ctr28,
      case when p.cli7>0 then p.ped7::numeric/p.cli7 end as cr7,
      case when p.cli28>0 then p.ped28::numeric/p.cli28 end as cr28,
      (pr.p7 is not null and pr.p28 is not null and pr.p7 < 0.95*pr.p28) as promo,
      cfg.meta_roas, cfg.data_inicio,
      (v_hoje - coalesce(cfg.data_inicio, v_hoje))::int as dias_campanha
    from perf p
    join cfg on cfg.loja_id=p.loja_id and cfg.item_id=p.item_id
    left join fator_item fi on fi.loja_id=p.loja_id and fi.item_id=p.item_id
    left join fator_loja fl on fl.loja_id=p.loja_id
    left join custo_item ci on ci.loja_id=p.loja_id and ci.item_id=p.item_id
    left join preco_item pr on pr.loja_id=p.loja_id and pr.item_id=p.item_id
    where p.gasto7 > 0
  ),
  calc as (
    select *,
      (1 - taxa_pct/100.0 - 0.06 - coalesce(custo,0)/nullif(ticket,0)) as margem,
      roas_shopee * fator as roas_real,
      (ctr7 is not null and ctr28 > 0 and abs(ctr7-ctr28)/ctr28 <= 0.10) as ctr_estavel,
      (cr7  is not null and cr28  > 0 and abs(cr7 -cr28 )/cr28  <= 0.10) as cr_estavel
    from base
  ),
  calc2 as (
    select *,
      1/nullif(margem,0) as roas_min,
      greatest(p_meta_global, 1/nullif(margem,0)) / nullif(fator,0) as meta_calc,
      -- Alerta: ROAS real diário < 0,7×mín em CADA um dos últimos 3 dias.
      (select count(*) from ads_item_performance_daily d
        where d.loja_id=c.loja_id and d.item_id=c.item_id and d.escopo='direto'
          and d.dia between v_hoje-3 and v_hoje-1 and d.gasto>0
          and (d.gmv/d.gasto)*c.fator < 0.7 * (1/nullif(c.margem,0))) = 3 as alerta_roas
    from calc c
  ),
  classif as (
    select *,
      case
        when dias_campanha < 14 then 'aprendizado'
        when margem is null or margem <= 0 then 'sem_margem'
        when roas_real < roas_min then 'abaixo_do_minimo'
        when ctr7 < 0.8*ctr28 and cr_estavel then 'problema_anuncio'
        when cr7  < 0.8*cr28  and ctr_estavel then 'problema_pagina'
        when meta_roas is not null and roas_shopee < 0.7*meta_roas then 'meta_nao_entregue'
        when roas_real >= 1.3*roas_min and not promo then 'campeao'
        when meta_roas is not null and abs(meta_roas - meta_calc) > 0.15*meta_calc then 'meta_desalinhada'
        else 'saudavel'
      end as classificacao
    from calc2
  )
  insert into ads_recomendacoes
    (loja_id, dia, item_id, campaign_id, gasto_7d, roas_shopee, fator, roas_real, roas_minimo,
     meta_roas, meta_calculada, dias_campanha, classificacao, acao, detalhe,
     promo, alerta_roas, ctr_7d, ctr_28d, cr_7d, cr_28d)
  select loja_id, v_hoje, item_id, campaign_id, round(gasto7,2), round(roas_shopee,2), round(fator,4),
    round(roas_real,2), round(roas_min,2), meta_roas, round(meta_calc,2), dias_campanha, classificacao,
    case classificacao
      when 'aprendizado'       then 'Aguardar (aprendizado); não editar meta'
      when 'sem_margem'        then 'Cadastrar custo/checar margem (sem base pra ROAS mínimo)'
      when 'abaixo_do_minimo'  then 'Pausar OU revisar página/preço antes de reinvestir'
      when 'problema_anuncio'  then 'Trocar capa / revisar título e preço exibido (CTR caiu, CR estável)'
      when 'problema_pagina'   then 'Auditar preço vs concorrência, avaliações, estoque de variações (CR caiu)'
      when 'meta_nao_entregue' then 'Checar Impulsão Rápida/Aumento Automático; reduzir meta em degraus'
      when 'campeao'           then 'Aumentar orçamento 20-30%; manter meta'
      when 'meta_desalinhada'  then 'Ajustar meta na Shopee (em degraus)'
      else 'Nenhuma ação'
    end,
    format('ROAS real %s vs mín %s · meta %s · fator %s%s%s',
      round(roas_real,1), round(roas_min,1), coalesce(meta_roas,0), round(fator,3),
      case when promo then ' · PROMO (não escalar)' else '' end,
      case when alerta_roas then ' · 🚨 3 dias abaixo de 0,7×mín' else '' end),
    promo, alerta_roas, round(ctr7,4), round(ctr28,4), round(cr7,4), round(cr28,4)
  from classif;

  get diagnostics v_n = row_count;
  return v_n;
end $$;
grant execute on function ads_recomendacoes_calc(uuid[], numeric) to anon, authenticated;
