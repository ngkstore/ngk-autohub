-- FASE 2 do controle de Ads (spec §5-6): ROAS real, ROAS mínimo e motor de
-- regras por item. Lê a performance (Fase 1), o fator de efetivação (pedidos),
-- a margem efetiva (taxa real do escrow + custo) e a config (meta ROAS).

create table if not exists ads_recomendacoes (
  id             bigserial primary key,
  loja_id        uuid not null,
  dia            date not null,
  item_id        bigint not null,
  campaign_id    bigint,
  produto        text,
  gasto_7d       numeric(12,2),
  roas_shopee    numeric(8,2),   -- ROAS bruto (MM7, direto)
  fator          numeric(6,4),   -- efetivação (receita paga / GMV feito, 90d)
  roas_real      numeric(8,2),   -- roas_shopee * fator
  roas_minimo    numeric(8,2),   -- 1 / margem efetiva
  meta_roas      numeric(8,2),   -- meta configurada na Shopee
  meta_calculada numeric(8,2),   -- max(30, roas_min) / fator
  dias_campanha  int,
  classificacao  text,
  acao           text,
  detalhe        text,
  status         text default 'pendente',
  criado_em      timestamptz default now(),
  unique (loja_id, dia, item_id)
);
create index if not exists ads_recomendacoes_loja_dia_idx on ads_recomendacoes (loja_id, dia);

-- Recalcula as recomendações do dia. meta_roas_real_global default = 30.
create or replace function ads_recomendacoes_calc(p_loja_ids uuid[] default null, p_meta_global numeric default 30)
returns int language plpgsql security definer as $$
declare v_hoje date := (now() at time zone 'America/Sao_Paulo')::date; v_n int;
begin
  delete from ads_recomendacoes where dia = v_hoje and (p_loja_ids is null or loja_id = any(p_loja_ids));

  with perf7 as (
    select loja_id, item_id, campaign_id,
      sum(gasto) as gasto, sum(gmv) as gmv,
      sum(coalesce(cliques,0)) as cliques, sum(coalesce(impressoes,0)) as impressoes
    from ads_item_performance_daily
    where escopo='direto' and dia >= v_hoje - 7
      and (p_loja_ids is null or loja_id = any(p_loja_ids))
    group by 1,2,3
  ),
  -- Fator de efetivação por item (90d): receita paga / GMV de pedidos feitos.
  fator_item as (
    select pi.loja_id, pi.item_id::bigint as item_id,
      sum(pi.qtd*pi.preco) filter (where p.pedido_efetivado) as efet,
      sum(pi.qtd*pi.preco) as bruto,
      count(distinct p.id) as pedidos_base
    from pedido_itens pi join pedidos p on p.id = pi.pedido_id
    where p.data_pedido >= now() - interval '90 days'
      and (p_loja_ids is null or pi.loja_id = any(p_loja_ids))
    group by 1,2
  ),
  fator_loja as (  -- fallback pra item com poucos pedidos (<20)
    select loja_id, sum(efet)/nullif(sum(bruto),0) as f from fator_item group by 1
  ),
  -- Custo médio por item (custos_variacao das variações do item).
  custo_item as (
    select pi.loja_id, pi.item_id::bigint as item_id, avg(cv.custo) as custo
    from pedido_itens pi
    join custos_variacao cv on cv.loja_id=pi.loja_id and norm_sku(cv.model_sku)=norm_sku(pi.model_sku)
    where (p_loja_ids is null or pi.loja_id = any(p_loja_ids))
    group by 1,2
  ),
  -- Config vigente por item (meta ROAS, orçamento, início, status).
  cfg as (
    select distinct on (loja_id, item_id) loja_id, item_id, campaign_id,
      meta_roas, orcamento, data_inicio, status
    from ads_campaign_config_daily
    where dia = (select max(dia) from ads_campaign_config_daily)
      and item_id is not null and status in ('ongoing','paused')
    order by loja_id, item_id, dia desc
  ),
  base as (
    select p.loja_id, p.item_id, coalesce(p.campaign_id, cfg.campaign_id) as campaign_id,
      p.gasto, p.gmv,
      case when p.gasto>0 then p.gmv/p.gasto else 0 end as roas_shopee,
      coalesce(
        case when fi.pedidos_base >= 20 and fi.bruto>0 then fi.efet/fi.bruto else null end,
        fl.f, 1
      ) as fator,
      -- taxa real do escrow (taxa_item_cache) e custo -> margem efetiva.
      coalesce((select round(100.0*ti.taxa/nullif(ti.vt,0),1) from taxa_item_cache ti
                where ti.loja_id=p.loja_id and ti.item_id=p.item_id::text and ti.vt>0), 14) as taxa_pct,
      ci.custo,
      case when p.gmv>0 and (select sum(pedidos) from ads_item_performance_daily d
             where d.loja_id=p.loja_id and d.item_id=p.item_id and d.escopo='direto' and d.dia>=v_hoje-7) > 0
        then p.gmv / (select sum(pedidos) from ads_item_performance_daily d
             where d.loja_id=p.loja_id and d.item_id=p.item_id and d.escopo='direto' and d.dia>=v_hoje-7)
        else null end as ticket,
      cfg.meta_roas, cfg.orcamento, cfg.data_inicio,
      (v_hoje - coalesce(cfg.data_inicio, v_hoje))::int as dias_campanha
    from perf7 p
    join cfg on cfg.loja_id=p.loja_id and cfg.item_id=p.item_id  -- só itens de campanha ativa
    left join fator_item fi on fi.loja_id=p.loja_id and fi.item_id=p.item_id
    left join fator_loja fl on fl.loja_id=p.loja_id
    left join custo_item ci on ci.loja_id=p.loja_id and ci.item_id=p.item_id
    where p.gasto > 0
  ),
  calc as (
    select *,
      -- margem efetiva = 1 - taxa% - 6%(ads+afil+imposto) - custo/preço. roas_min=1/margem.
      (1 - taxa_pct/100.0 - 0.06 - coalesce(custo,0)/nullif(ticket, 0)) as margem,
      roas_shopee * fator as roas_real
    from base
  )
  insert into ads_recomendacoes
    (loja_id, dia, item_id, campaign_id, gasto_7d, roas_shopee, fator, roas_real,
     roas_minimo, meta_roas, meta_calculada, dias_campanha, classificacao, acao, detalhe)
  select loja_id, v_hoje, item_id, campaign_id, round(gasto,2), round(roas_shopee,2),
    round(fator,4), round(roas_real,2),
    round(1/nullif(margem,0), 2) as roas_min,
    meta_roas,
    round(greatest(p_meta_global, 1/nullif(margem,0)) / nullif(fator,0), 2) as meta_calc,
    dias_campanha,
    -- MOTOR DE REGRAS (§6, núcleo)
    case
      when dias_campanha < 14 then 'aprendizado'
      when margem is null or margem <= 0 then 'sem_margem'
      when roas_real < 1/nullif(margem,0) then 'abaixo_do_minimo'
      when roas_real >= 1.3 * (1/nullif(margem,0)) then 'campeao'
      when meta_roas is not null and abs(meta_roas - greatest(p_meta_global,1/nullif(margem,0))/nullif(fator,0))
           > 0.15 * greatest(p_meta_global,1/nullif(margem,0))/nullif(fator,0) then 'meta_desalinhada'
      else 'saudavel'
    end as classificacao,
    case
      when dias_campanha < 14 then 'Aguardar (aprendizado); não editar meta'
      when margem is null or margem <= 0 then 'Cadastrar custo/checar margem (sem base pra ROAS mínimo)'
      when roas_real < 1/nullif(margem,0) then 'Pausar OU revisar página/preço antes de reinvestir'
      when roas_real >= 1.3 * (1/nullif(margem,0)) then 'Aumentar orçamento 20-30%; manter meta'
      when meta_roas is not null and abs(meta_roas - greatest(p_meta_global,1/nullif(margem,0))/nullif(fator,0))
           > 0.15 * greatest(p_meta_global,1/nullif(margem,0))/nullif(fator,0) then 'Ajustar meta na Shopee (em degraus)'
      else 'Nenhuma ação'
    end as acao,
    format('ROAS real %s vs mínimo %s · meta %s · fator %s',
      round(roas_shopee*fator,1), round(1/nullif(margem,0),1), coalesce(meta_roas,0), round(fator,3)) as detalhe
  from calc;

  get diagnostics v_n = row_count;
  return v_n;
end $$;
grant execute on function ads_recomendacoes_calc(uuid[], numeric) to anon, authenticated;
