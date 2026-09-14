-- EXTENSÕES do controle de Ads GMV Max:
--  1) ORÇAMENTO IDEAL por item (média "normal" de gasto 28d sem promo/campanha,
--     esgotamento do teto, censura, multiplicador por classificação).
--  2) MONITOR DE JANELAS: diff diário dos snapshots de config -> ads_alteracoes;
--     estado por item (aprendizado / estabilizacao / livre) com dias restantes;
--     supressão de recomendação de META em janela + 'pronto_proximo_degrau'.
-- Só leitura da API (tudo vem das tabelas já coletadas). Idempotente.

-- ---------------------------------------------------------------------------
-- 1a) Dias de campanha Shopee (excluídos da média normal de gasto). Editável:
--     basta inserir/apagar linhas.
create table if not exists ads_dias_campanha_shopee (dia date primary key, nome text);
insert into ads_dias_campanha_shopee (dia, nome)
select make_date(y, m, m), m||'.'||m from generate_series(2026, 2027) y, generate_series(1, 12) m
on conflict do nothing;
insert into ads_dias_campanha_shopee (dia, nome) values
  ('2026-11-27','Black Friday'), ('2027-11-26','Black Friday'),
  ('2026-03-15','Dia do Consumidor'), ('2027-03-15','Dia do Consumidor')
on conflict do nothing;
grant select on ads_dias_campanha_shopee to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2a) Alterações detectadas entre snapshots consecutivos de ads_campaign_config_daily
create table if not exists ads_alteracoes (
  id            bigserial primary key,
  loja_id       uuid not null,
  item_id       bigint,
  campaign_id   bigint not null,
  data_deteccao date not null,
  campo         text not null,          -- meta_roas | orcamento | status
  valor_antigo  text,
  valor_novo    text,
  criado_em     timestamptz default now(),
  unique (loja_id, campaign_id, data_deteccao, campo)
);
create index if not exists ads_alteracoes_camp_idx on ads_alteracoes (loja_id, campaign_id, campo, data_deteccao desc);
grant select on ads_alteracoes to anon, authenticated;

-- Compara cada snapshot com o anterior (por campanha) e registra o que mudou.
-- Reprocessa o histórico inteiro; o UNIQUE torna idempotente.
create or replace function ads_detectar_alteracoes() returns int
language plpgsql security definer as $$
declare v_n int;
begin
  with s as (
    select loja_id, campaign_id, item_id, dia,
      meta_roas::text as meta, orcamento::text as orc, status,
      lag(meta_roas::text) over w as p_meta, lag(orcamento::text) over w as p_orc,
      lag(status) over w as p_status, lag(dia) over w as p_dia
    from ads_campaign_config_daily
    window w as (partition by loja_id, campaign_id order by dia)
  ),
  d as (
    select loja_id, campaign_id, item_id, dia, 'meta_roas' as campo, p_meta as va, meta as vn
      from s where p_dia is not null and p_meta is distinct from meta
    union all
    select loja_id, campaign_id, item_id, dia, 'orcamento', p_orc, orc
      from s where p_dia is not null and p_orc is distinct from orc
    union all
    select loja_id, campaign_id, item_id, dia, 'status', p_status, status
      from s where p_dia is not null and p_status is distinct from status
  )
  insert into ads_alteracoes (loja_id, item_id, campaign_id, data_deteccao, campo, valor_antigo, valor_novo)
  select loja_id, item_id, campaign_id, dia, campo, va, vn from d
  on conflict (loja_id, campaign_id, data_deteccao, campo) do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end $$;
grant execute on function ads_detectar_alteracoes() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Índices pro cálculo (lookup de orçamento por campanha/dia e janela de 60d de pedido_itens).
create index if not exists ads_campaign_config_camp_dia_idx on ads_campaign_config_daily (loja_id, campaign_id, dia);
create index if not exists pedido_itens_dia_idx on pedido_itens (dia);

-- ---------------------------------------------------------------------------
-- Novas colunas em ads_recomendacoes
alter table ads_recomendacoes add column if not exists roas_28d numeric(8,2);
alter table ads_recomendacoes add column if not exists gasto_medio_normal_28d numeric(12,2);
alter table ads_recomendacoes add column if not exists dias_normais_28d int;
alter table ads_recomendacoes add column if not exists dias_esgotados_7d int;
alter table ads_recomendacoes add column if not exists censurado_teto boolean default false;
alter table ads_recomendacoes add column if not exists orcamento_configurado numeric(12,2);
alter table ads_recomendacoes add column if not exists orcamento_ideal numeric(12,2);
alter table ads_recomendacoes add column if not exists estado_janela text;
alter table ads_recomendacoes add column if not exists dias_restantes_janela int;
alter table ads_recomendacoes add column if not exists motivo_supressao text;
-- v3.1 (14/set): gasto normal dos últimos 7 dias (item escalando) e avaliação pós-degrau.
alter table ads_recomendacoes add column if not exists gasto_medio_normal_7d numeric(12,2);
alter table ads_recomendacoes add column if not exists degrau_avaliacao jsonb;
-- v3.2: meta sugerida nas DUAS direções (subir em degrau, baixar quando não entregue,
-- voltar quando o degrau regrediu). As telas usam este valor nos botões.
alter table ads_recomendacoes add column if not exists meta_sugerida numeric(8,2);

-- ---------------------------------------------------------------------------
-- Motor v3 = v2 + orçamento ideal + relógio das janelas.
-- Ordem: aprendizado · sem_margem · abaixo_do_minimo · problema_anuncio ·
-- problema_pagina · [meta_nao_entregue -> 'estabilizacao' se em janela] · campeao ·
-- orcamento_esgotando · [meta_desalinhada -> 'estabilizacao' | 'pronto_proximo_degrau'
-- | 'meta_desalinhada'] · saudavel.
-- Multiplicador do orçamento ideal: campeao/saudavel/pronto_proximo_degrau 2,5× ·
-- aprendizado/estabilizacao/problema_*/meta_* 1,25× · abaixo_do_minimo 0 ·
-- sem_margem sem recomendação. Censurado pelo teto -> orçamento configurado × 1,25.
create or replace function ads_recomendacoes_calc(p_loja_ids uuid[] default null, p_meta_global numeric default 30)
returns int language plpgsql security definer as $$
declare v_hoje date := (now() at time zone 'America/Sao_Paulo')::date; v_n int;
begin
  perform ads_detectar_alteracoes();  -- relógio sempre atualizado antes de classificar
  delete from ads_recomendacoes where dia = v_hoje and (p_loja_ids is null or loja_id = any(p_loja_ids));

  with perf as (
    select loja_id, item_id, max(campaign_id) as campaign_id,
      sum(gasto)      filter (where dia >= v_hoje-7) as gasto7,
      sum(gmv)        filter (where dia >= v_hoje-7) as gmv7,
      sum(pedidos)    filter (where dia >= v_hoje-7) as ped7,
      sum(cliques)    filter (where dia >= v_hoje-7) as cli7,
      sum(impressoes) filter (where dia >= v_hoje-7) as imp7,
      sum(gasto) as gasto28, sum(gmv) as gmv28,
      sum(pedidos) as ped28, sum(cliques) as cli28, sum(impressoes) as imp28
    from ads_item_performance_daily
    where escopo='direto' and dia >= v_hoje-28
      and (p_loja_ids is null or loja_id = any(p_loja_ids))
    group by 1,2
  ),
  -- Preço médio vendido POR DIA e baseline dos 28 dias anteriores -> flag promo por dia.
  preco_dia as (
    select loja_id, item_id, dia,
      sum(qtd*preco)/nullif(sum(qtd),0) as p_dia,
      sum(sum(qtd*preco)) over (partition by loja_id, item_id order by dia
        range between interval '28 days' preceding and interval '1 day' preceding)
      / nullif(sum(sum(qtd)) over (partition by loja_id, item_id order by dia
        range between interval '28 days' preceding and interval '1 day' preceding), 0) as p_base
    from pedido_itens
    where dia >= v_hoje-60 and (p_loja_ids is null or loja_id = any(p_loja_ids))
      and (loja_id, item_id::bigint) in (select loja_id, item_id from perf)  -- só itens com Ads
    group by loja_id, item_id, dia
  ),
  promo_dia as (
    select loja_id, item_id::bigint as item_id, dia from preco_dia
    where p_base is not null and p_dia < 0.95*p_base
  ),
  -- Gasto médio "normal": últimos 28 dias com gasto, sem dias de promo e sem dias de
  -- campanha Shopee. Agrega por DIA antes (item com 2+ campanhas soma as duas);
  -- dias sem gasto ficam de fora: a média é do dia ativo típico.
  normal as (
    select loja_id, item_id, avg(gasto_dia) as gasto_medio, (count(*))::int as dias_normais,
      avg(gasto_dia) filter (where dia >= v_hoje-7) as gasto_medio_7d  -- item escalando: a média de 28d atrasa
    from (
      select d.loja_id, d.item_id, d.dia, sum(d.gasto) as gasto_dia
      from ads_item_performance_daily d
      left join promo_dia pd on pd.loja_id=d.loja_id and pd.item_id=d.item_id and pd.dia=d.dia
      left join ads_dias_campanha_shopee cs on cs.dia=d.dia
      where d.escopo='direto' and d.dia between v_hoje-28 and v_hoje-1
        and pd.dia is null and cs.dia is null
        and (p_loja_ids is null or d.loja_id = any(p_loja_ids))
      group by d.loja_id, d.item_id, d.dia
      having sum(d.gasto) > 0
    ) x
    group by 1,2
  ),
  -- Esgotamento: gasto do dia >= 95% do orçamento (snapshot do dia; senão o último conhecido).
  orc_dia as (
    select d.loja_id, d.campaign_id, d.dia, d.gasto,
      coalesce(c.orcamento,
        (select c2.orcamento from ads_campaign_config_daily c2
          where c2.loja_id=d.loja_id and c2.campaign_id=d.campaign_id and c2.dia<=d.dia order by c2.dia desc limit 1),
        (select c3.orcamento from ads_campaign_config_daily c3
          where c3.loja_id=d.loja_id and c3.campaign_id=d.campaign_id order by c3.dia desc limit 1)) as orcamento
    from ads_item_performance_daily d
    left join ads_campaign_config_daily c on c.loja_id=d.loja_id and c.campaign_id=d.campaign_id and c.dia=d.dia
    where d.escopo='direto' and d.dia between v_hoje-7 and v_hoje-1
      and (p_loja_ids is null or d.loja_id = any(p_loja_ids))
  ),
  esgot as (
    select loja_id, campaign_id,
      (count(*) filter (where orcamento>0 and gasto >= 0.95*orcamento))::int as dias_esgotados
    from orc_dia group by 1,2
  ),
  fator_item as (
    select pi.loja_id, pi.item_id::bigint as item_id,
      sum(pi.qtd*pi.preco) filter (where p.pedido_efetivado) as efet,
      sum(pi.qtd*pi.preco) as bruto, count(distinct p.id) as pedidos_base
    from pedido_itens pi join pedidos p on p.id = pi.pedido_id
    where p.data_pedido >= now() - interval '90 days'
      and (p_loja_ids is null or pi.loja_id = any(p_loja_ids))
      and (pi.loja_id, pi.item_id::bigint) in (select loja_id, item_id from perf)  -- só itens com Ads
    group by 1,2
  ),
  -- Fallback "fator médio da loja" (item com <20 pedidos): o fator estimado da loja
  -- inteira, já calculado por ads_fator_consolidar (mensal) — evita varrer todos os itens.
  fator_loja as (
    select distinct on (loja_id) loja_id, fator_estimado as f
    from ads_fator_historico order by loja_id, competencia desc
  ),
  custo_item as (
    select pi.loja_id, pi.item_id::bigint as item_id, avg(cv.custo) as custo
    from pedido_itens pi
    join custos_variacao cv on cv.loja_id=pi.loja_id and norm_sku(cv.model_sku)=norm_sku(pi.model_sku)
    where pi.dia >= v_hoje-90 and (p_loja_ids is null or pi.loja_id = any(p_loja_ids))
      and (pi.loja_id, pi.item_id::bigint) in (select loja_id, item_id from perf)  -- só itens com Ads
    group by 1,2
  ),
  preco_item as (  -- promo do ITEM (7d vs 28d anteriores) — regra campeão
    select loja_id, item_id::bigint as item_id,
      sum(qtd*preco) filter (where dia >= v_hoje-7) / nullif(sum(qtd) filter (where dia >= v_hoje-7),0) as p7,
      sum(qtd*preco) filter (where dia <  v_hoje-7) / nullif(sum(qtd) filter (where dia <  v_hoje-7),0) as p28
    from pedido_itens
    where dia >= v_hoje-35 and (p_loja_ids is null or loja_id = any(p_loja_ids))
      and (loja_id, item_id::bigint) in (select loja_id, item_id from perf)  -- só itens com Ads
    group by 1,2
  ),
  cfg as (
    select distinct on (loja_id, item_id) loja_id, item_id, campaign_id, meta_roas, orcamento, data_inicio, status
    from ads_campaign_config_daily
    where dia = (select max(dia) from ads_campaign_config_daily)
      and item_id is not null and status in ('ongoing','paused')
    order by loja_id, item_id, dia desc
  ),
  alt_meta as (  -- última alteração de META por campanha (relógio de estabilização)
    select loja_id, campaign_id, max(data_deteccao) as ultima
    from ads_alteracoes where campo='meta_roas' group by 1,2
  ),
  -- Avaliação pós-degrau (v3.1): última troca de META (≤21 dias, com ≥3 dias de dados
  -- depois). Compara por dia-calendário os 7 dias ANTES (D-8..D-2) com os dias DEPOIS
  -- (D..ontem); D-1 (dia em que a troca aconteceu) fica de fora.
  degrau_alt as (
    select distinct on (loja_id, campaign_id) loja_id, campaign_id, data_deteccao as data_troca,
      nullif(valor_antigo,'')::numeric as meta_antes, nullif(valor_novo,'')::numeric as meta_depois
    from ads_alteracoes
    where campo='meta_roas' and data_deteccao >= v_hoje-21
      and (p_loja_ids is null or loja_id = any(p_loja_ids))
    order by loja_id, campaign_id, data_deteccao desc
  ),
  degrau as (
    select da.loja_id, da.campaign_id, da.data_troca, da.meta_antes, da.meta_depois,
      (v_hoje - da.data_troca)::int as dias_depois,
      coalesce(sum(d.gmv)   filter (where d.dia < da.data_troca-1), 0) / 7.0 as gmv_dia_antes,
      coalesce(sum(d.gasto) filter (where d.dia < da.data_troca-1), 0) / 7.0 as gasto_dia_antes,
      coalesce(sum(d.gmv)   filter (where d.dia >= da.data_troca), 0) / (v_hoje - da.data_troca) as gmv_dia_depois,
      coalesce(sum(d.gasto) filter (where d.dia >= da.data_troca), 0) / (v_hoje - da.data_troca) as gasto_dia_depois
    from degrau_alt da
    left join ads_item_performance_daily d on d.loja_id=da.loja_id and d.campaign_id=da.campaign_id
      and d.escopo='direto' and d.dia between da.data_troca-8 and v_hoje-1 and d.dia <> da.data_troca-1
    where da.data_troca <= v_hoje-3
    group by 1,2,3,4,5
  ),
  base as (
    select p.loja_id, p.item_id, coalesce(p.campaign_id, cfg.campaign_id) as campaign_id,
      p.gasto7, p.gmv7, p.gasto28, p.gmv28,
      case when p.gasto7>0 then p.gmv7/p.gasto7 else 0 end as roas_shopee,
      case when p.gasto28>0 then p.gmv28/p.gasto28 else 0 end as roas_shopee28,
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
      cfg.meta_roas, cfg.data_inicio, cfg.orcamento as orc_config,
      (v_hoje - coalesce(cfg.data_inicio, v_hoje))::int as dias_campanha,
      nm.gasto_medio as gasto_medio_normal, nm.dias_normais, nm.gasto_medio_7d as gasto_medio_normal_7d,
      coalesce(eg.dias_esgotados, 0) as dias_esgotados,
      (v_hoje - am.ultima)::int as dias_desde_meta,
      dg.data_troca, dg.meta_antes, dg.meta_depois, dg.dias_depois,
      dg.gmv_dia_antes, dg.gasto_dia_antes, dg.gmv_dia_depois, dg.gasto_dia_depois
    from perf p
    join cfg on cfg.loja_id=p.loja_id and cfg.item_id=p.item_id
    left join fator_item fi on fi.loja_id=p.loja_id and fi.item_id=p.item_id
    left join fator_loja fl on fl.loja_id=p.loja_id
    left join custo_item ci on ci.loja_id=p.loja_id and ci.item_id=p.item_id
    left join preco_item pr on pr.loja_id=p.loja_id and pr.item_id=p.item_id
    left join normal nm on nm.loja_id=p.loja_id and nm.item_id=p.item_id
    left join esgot eg on eg.loja_id=p.loja_id and eg.campaign_id=coalesce(p.campaign_id, cfg.campaign_id)
    left join alt_meta am on am.loja_id=p.loja_id and am.campaign_id=coalesce(p.campaign_id, cfg.campaign_id)
    left join degrau dg on dg.loja_id=p.loja_id and dg.campaign_id=coalesce(p.campaign_id, cfg.campaign_id)
    where p.gasto7 > 0
  ),
  calc as (
    select *,
      (1 - taxa_pct/100.0 - 0.06 - coalesce(custo,0)/nullif(ticket,0)) as margem,
      roas_shopee * fator as roas_real,
      (ctr7 is not null and ctr28 > 0 and abs(ctr7-ctr28)/ctr28 <= 0.10) as ctr_estavel,
      (cr7  is not null and cr28  > 0 and abs(cr7 -cr28 )/cr28  <= 0.10) as cr_estavel,
      (dias_esgotados >= 5) as esgotado,
      case when dias_campanha < 14 then 'aprendizado'
           when dias_desde_meta is not null and dias_desde_meta < 12 then 'estabilizacao'
           else 'livre' end as estado_janela,
      case when dias_campanha < 14 then 14 - dias_campanha
           when dias_desde_meta is not null and dias_desde_meta < 12 then 12 - dias_desde_meta
           else 0 end as dias_restantes,
      (dias_campanha >= 15 and (dias_desde_meta is null or dias_desde_meta >= 13)) as livre_1d
    from base
  ),
  calc2 as (
    select *,
      1/nullif(margem,0) as roas_min,
      greatest(p_meta_global, 1/nullif(margem,0)) / nullif(fator,0) as meta_calc,
      (select count(distinct d.dia) from ads_item_performance_daily d
        where d.loja_id=c.loja_id and d.item_id=c.item_id and d.escopo='direto'
          and d.dia between v_hoje-3 and v_hoje-1 and d.gasto>0
          and (d.gmv/d.gasto)*c.fator < 0.7 * (1/nullif(c.margem,0))) = 3 as alerta_roas,
      coalesce(esgotado and roas_shopee*fator >= 1/nullif(margem,0), false) as censurado
    from calc c
  ),
  calc3 as (
    select *,
      (meta_roas is not null and roas_shopee < 0.7*meta_roas) as f_meta_nao_entregue,
      (meta_roas is not null and meta_calc is not null and abs(meta_roas - meta_calc) > 0.15*meta_calc) as f_meta_desalinhada,
      (roas_real >= roas_min and roas_shopee >= 0.9*roas_shopee28) as perf_mantida,
      -- Pós-degrau: lucro/dia estimado = GMV × fator × margem − gasto. "Regrediu" quando:
      --   meta SUBIU  → GMV/dia caiu >30% e o lucro/dia ficou menor (público esfriou);
      --   meta DESCEU → lucro/dia caiu >20% (o ROAS caiu mais do que o volume subiu).
      gmv_dia_antes*fator*margem - gasto_dia_antes   as lucro_dia_antes,
      gmv_dia_depois*fator*margem - gasto_dia_depois as lucro_dia_depois,
      coalesce(gasto_dia_antes >= 10 and gmv_dia_antes > 0 and (
        (meta_depois > meta_antes and gmv_dia_depois < 0.7*gmv_dia_antes
          and (gmv_dia_depois*fator*margem - gasto_dia_depois) < (gmv_dia_antes*fator*margem - gasto_dia_antes))
        or
        (meta_depois < meta_antes
          and (gmv_dia_depois*fator*margem - gasto_dia_depois) < 0.8*(gmv_dia_antes*fator*margem - gasto_dia_antes))
      ), false) as f_degrau_regrediu
    from calc2
  ),
  classif as (
    select *,
      case
        when dias_campanha < 14 then 'aprendizado'
        when margem is null or margem <= 0 then 'sem_margem'
        when roas_real < roas_min then 'abaixo_do_minimo'
        when f_degrau_regrediu then 'retomar_meta'
        -- problema_* só quando o item NÃO está confortável (ROAS real < 1,3× mín): item
        -- escalando perde CTR/CR naturalmente; se segue lucrativo vira só observação.
        when ctr7 < 0.8*ctr28 and cr_estavel and roas_real < 1.3*roas_min then 'problema_anuncio'
        when cr7  < 0.8*cr28  and ctr_estavel and roas_real < 1.3*roas_min then 'problema_pagina'
        when f_meta_nao_entregue and estado_janela='estabilizacao' then 'estabilizacao'
        when f_meta_nao_entregue then 'meta_nao_entregue'
        when roas_real >= 1.3*roas_min and not promo then 'campeao'
        when esgotado and roas_real >= roas_min and not promo then 'orcamento_esgotando'
        when f_meta_desalinhada and estado_janela='estabilizacao' then 'estabilizacao'
        when f_meta_desalinhada and livre_1d and perf_mantida then 'pronto_proximo_degrau'
        when f_meta_desalinhada then 'meta_desalinhada'
        else 'saudavel'
      end as classificacao
    from calc3
  ),
  fin as (
    select *,
      case classificacao
        when 'campeao' then 2.5 when 'saudavel' then 2.5 when 'pronto_proximo_degrau' then 2.5
        when 'abaixo_do_minimo' then 0
        when 'sem_margem' then null
        else 1.25 end as mult,
      -- próximo degrau: 15% da meta atual na direção da meta calculada (nunca passa dela)
      case when meta_roas is not null and meta_calc is not null
        then round((meta_roas + sign(meta_calc-meta_roas)*least(abs(meta_calc-meta_roas), 0.15*meta_roas))::numeric, 1) end as proximo_degrau,
      -- degrau pra BAIXO (meta não entregue): −15% da meta, nunca abaixo do ROAS mínimo em
      -- termos de Shopee (mín ÷ fator = empate). A Shopee entrega o que consegue; meta alta
      -- demais só estrangula a entrega.
      case when meta_roas is not null and roas_min is not null
        then round(greatest(0.85*meta_roas, roas_min/nullif(fator,0))::numeric, 1) end as degrau_baixo
    from classif
  ),
  fin2 as (
    select *,
      case classificacao
        when 'pronto_proximo_degrau' then proximo_degrau
        when 'meta_desalinhada'      then proximo_degrau
        when 'meta_nao_entregue'     then case when degrau_baixo < meta_roas then degrau_baixo end
        when 'retomar_meta'          then meta_antes
      end as meta_sugerida
    from fin
  )
  insert into ads_recomendacoes
    (loja_id, dia, item_id, campaign_id, gasto_7d, roas_shopee, fator, roas_real, roas_minimo,
     meta_roas, meta_calculada, dias_campanha, classificacao, acao, detalhe,
     promo, alerta_roas, ctr_7d, ctr_28d, cr_7d, cr_28d,
     roas_28d, gasto_medio_normal_28d, dias_normais_28d, dias_esgotados_7d, censurado_teto,
     orcamento_configurado, orcamento_ideal, estado_janela, dias_restantes_janela, motivo_supressao,
     gasto_medio_normal_7d, degrau_avaliacao, meta_sugerida)
  select loja_id, v_hoje, item_id, campaign_id, round(gasto7,2), round(roas_shopee,2), round(fator,4),
    round(roas_real,2), round(roas_min,2), meta_roas, round(meta_calc,2), dias_campanha, classificacao,
    case classificacao
      when 'aprendizado'           then format('Aguardar (aprendizado, faltam %s dia(s)); não editar meta', dias_restantes)
      when 'sem_margem'            then 'Cadastrar custo/checar margem (sem base pra ROAS mínimo)'
      when 'abaixo_do_minimo'      then 'Pausar OU revisar página/preço antes de reinvestir'
      when 'retomar_meta'          then format('Voltar a meta para %s: desde a troca %s → %s (%s dias) o GMV/dia foi de R$%s para R$%s e o lucro/dia de R$%s para R$%s — %s',
                                          meta_antes, meta_antes, meta_depois, dias_depois, round(gmv_dia_antes), round(gmv_dia_depois), round(lucro_dia_antes), round(lucro_dia_depois),
                                          case when meta_depois > meta_antes then 'público esfriou' else 'o ROAS caiu mais do que o volume subiu' end)
      when 'problema_anuncio'      then 'Trocar capa / revisar título e preço exibido (CTR caiu, CR estável)'
      when 'problema_pagina'       then 'Auditar preço vs concorrência, avaliações, estoque de variações (CR caiu)'
      when 'estabilizacao'         then format('Aguardar %s dia(s) — janela de estabilização (meta alterada há %s dias)', dias_restantes, dias_desde_meta)
      when 'meta_nao_entregue'     then case when degrau_baixo < meta_roas
                                          then format('Meta não entregue (ROAS Shopee %s vs meta %s): baixar a meta em degrau %s → %s (piso %s = empate) e checar Impulsão Rápida/Aumento Automático',
                                                      round(roas_shopee,1), meta_roas, meta_roas, degrau_baixo, round(roas_min/nullif(fator,0),1))
                                          else format('Meta não entregue (ROAS Shopee %s vs meta %s), mas a meta já está no piso (%s = empate): checar Impulsão Rápida/Aumento Automático, página e preço',
                                                      round(roas_shopee,1), meta_roas, round(roas_min/nullif(fator,0),1)) end
      when 'campeao'               then 'Aumentar orçamento 20-30%; manter meta'
      when 'orcamento_esgotando'   then format('Orçamento esgotando com ROAS saudável (%s de 7 dias no teto): aumentar 20-30%%', dias_esgotados)
      when 'pronto_proximo_degrau' then format('Aplicar próximo degrau da meta: %s → %s (alvo %s)', meta_roas, proximo_degrau, round(meta_calc,1))
      when 'meta_desalinhada'      then 'Ajustar meta na Shopee (em degraus)'
      else 'Nenhuma ação'
    end,
    format('ROAS real %s vs mín %s · meta %s · fator %s%s%s%s%s%s',
      round(roas_real,1), round(roas_min,1), coalesce(meta_roas,0), round(fator,3),
      case when promo then ' · PROMO (não escalar)' else '' end,
      case when alerta_roas then ' · 🚨 3 dias abaixo de 0,7×mín' else '' end,
      case when censurado then format(' · teto: %s/7 dias esgotados', dias_esgotados) else '' end,
      -- observações (v3.1): queda de CTR/CR num item que segue lucrativo; escala recente
      case when classificacao not in ('problema_anuncio','problema_pagina','abaixo_do_minimo','sem_margem','aprendizado')
             and ctr7 < 0.8*ctr28 and cr_estavel then format(' · ⚠️ CTR 7d %s%% vs 28d (segue lucrativo)', round(100*(ctr7/ctr28-1)))
           when classificacao not in ('problema_anuncio','problema_pagina','abaixo_do_minimo','sem_margem','aprendizado')
             and cr7 < 0.8*cr28 and ctr_estavel then format(' · ⚠️ CR 7d %s%% vs 28d (segue lucrativo%s)', round(100*(cr7/cr28-1)),
               case when gasto_medio_normal_7d > 1.5*gasto_medio_normal then format('; gasto 7d %s× o normal de 28d', round(gasto_medio_normal_7d/gasto_medio_normal,1)) else '' end)
           else '' end,
      case when data_troca is not null and classificacao <> 'retomar_meta'
           then format(' · degrau %s→%s há %sd: GMV/dia R$%s→R$%s, lucro/dia R$%s→R$%s (%s)', meta_antes, meta_depois, dias_depois,
                       round(gmv_dia_antes), round(gmv_dia_depois), round(lucro_dia_antes), round(lucro_dia_depois),
                       case when gmv_dia_depois < 0.7*gmv_dia_antes then 'volume caiu, lucro ok' else 'ok' end)
           else '' end),
    promo, alerta_roas, round(ctr7,4), round(ctr28,4), round(cr7,4), round(cr28,4),
    round(roas_shopee28,2), round(gasto_medio_normal,2), dias_normais, dias_esgotados, censurado,
    orc_config,
    case
      when classificacao = 'sem_margem' then null
      when classificacao = 'abaixo_do_minimo' then 0
      when censurado and orc_config is not null then round(orc_config*1.25, 2)
      when mult is null or gasto_medio_normal is null then null
      -- item escalando: usa o maior entre o normal de 28d e o normal dos últimos 7d
      else round(mult*greatest(gasto_medio_normal, coalesce(gasto_medio_normal_7d, 0)), 2)
    end,
    estado_janela, dias_restantes,
    case
      when classificacao = 'aprendizado' then format('aprendizado: faltam %s dia(s)', dias_restantes)
      when classificacao = 'estabilizacao' then format('estabilização: faltam %s dia(s) (meta alterada há %s dias); suprimida: %s',
        dias_restantes, dias_desde_meta, case when f_meta_nao_entregue then 'meta_nao_entregue' else 'meta_desalinhada' end)
      else null
    end,
    round(gasto_medio_normal_7d, 2),
    case when data_troca is not null then jsonb_build_object(
      'data_troca', data_troca, 'meta_antes', meta_antes, 'meta_depois', meta_depois, 'dias_depois', dias_depois,
      'gmv_dia_antes', round(gmv_dia_antes,2), 'gmv_dia_depois', round(gmv_dia_depois,2),
      'gasto_dia_antes', round(gasto_dia_antes,2), 'gasto_dia_depois', round(gasto_dia_depois,2),
      'roas_antes', round(gmv_dia_antes/nullif(gasto_dia_antes,0),1), 'roas_depois', round(gmv_dia_depois/nullif(gasto_dia_depois,0),1),
      'lucro_dia_antes', round(lucro_dia_antes,2), 'lucro_dia_depois', round(lucro_dia_depois,2),
      'veredito', case when f_degrau_regrediu then 'regrediu'
                       when gmv_dia_depois < 0.7*gmv_dia_antes then 'volume_caiu_lucro_ok' else 'ok' end) end,
    meta_sugerida
  from fin2;

  get diagnostics v_n = row_count;
  return v_n;
end $$;
grant execute on function ads_recomendacoes_calc(uuid[], numeric) to anon, authenticated;
