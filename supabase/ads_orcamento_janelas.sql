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
    select loja_id, item_id, avg(gasto_dia) as gasto_medio, (count(*))::int as dias_normais
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
      nm.gasto_medio as gasto_medio_normal, nm.dias_normais,
      coalesce(eg.dias_esgotados, 0) as dias_esgotados,
      (v_hoje - am.ultima)::int as dias_desde_meta
    from perf p
    join cfg on cfg.loja_id=p.loja_id and cfg.item_id=p.item_id
    left join fator_item fi on fi.loja_id=p.loja_id and fi.item_id=p.item_id
    left join fator_loja fl on fl.loja_id=p.loja_id
    left join custo_item ci on ci.loja_id=p.loja_id and ci.item_id=p.item_id
    left join preco_item pr on pr.loja_id=p.loja_id and pr.item_id=p.item_id
    left join normal nm on nm.loja_id=p.loja_id and nm.item_id=p.item_id
    left join esgot eg on eg.loja_id=p.loja_id and eg.campaign_id=coalesce(p.campaign_id, cfg.campaign_id)
    left join alt_meta am on am.loja_id=p.loja_id and am.campaign_id=coalesce(p.campaign_id, cfg.campaign_id)
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
      (roas_real >= roas_min and roas_shopee >= 0.9*roas_shopee28) as perf_mantida
    from calc2
  ),
  classif as (
    select *,
      case
        when dias_campanha < 14 then 'aprendizado'
        when margem is null or margem <= 0 then 'sem_margem'
        when roas_real < roas_min then 'abaixo_do_minimo'
        when ctr7 < 0.8*ctr28 and cr_estavel then 'problema_anuncio'
        when cr7  < 0.8*cr28  and ctr_estavel then 'problema_pagina'
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
        then round((meta_roas + sign(meta_calc-meta_roas)*least(abs(meta_calc-meta_roas), 0.15*meta_roas))::numeric, 1) end as proximo_degrau
    from classif
  )
  insert into ads_recomendacoes
    (loja_id, dia, item_id, campaign_id, gasto_7d, roas_shopee, fator, roas_real, roas_minimo,
     meta_roas, meta_calculada, dias_campanha, classificacao, acao, detalhe,
     promo, alerta_roas, ctr_7d, ctr_28d, cr_7d, cr_28d,
     roas_28d, gasto_medio_normal_28d, dias_normais_28d, dias_esgotados_7d, censurado_teto,
     orcamento_configurado, orcamento_ideal, estado_janela, dias_restantes_janela, motivo_supressao)
  select loja_id, v_hoje, item_id, campaign_id, round(gasto7,2), round(roas_shopee,2), round(fator,4),
    round(roas_real,2), round(roas_min,2), meta_roas, round(meta_calc,2), dias_campanha, classificacao,
    case classificacao
      when 'aprendizado'           then format('Aguardar (aprendizado, faltam %s dia(s)); não editar meta', dias_restantes)
      when 'sem_margem'            then 'Cadastrar custo/checar margem (sem base pra ROAS mínimo)'
      when 'abaixo_do_minimo'      then 'Pausar OU revisar página/preço antes de reinvestir'
      when 'problema_anuncio'      then 'Trocar capa / revisar título e preço exibido (CTR caiu, CR estável)'
      when 'problema_pagina'       then 'Auditar preço vs concorrência, avaliações, estoque de variações (CR caiu)'
      when 'estabilizacao'         then format('Aguardar %s dia(s) — janela de estabilização (meta alterada há %s dias)', dias_restantes, dias_desde_meta)
      when 'meta_nao_entregue'     then 'Checar Impulsão Rápida/Aumento Automático; reduzir meta em degraus'
      when 'campeao'               then 'Aumentar orçamento 20-30%; manter meta'
      when 'orcamento_esgotando'   then format('Orçamento esgotando com ROAS saudável (%s de 7 dias no teto): aumentar 20-30%%', dias_esgotados)
      when 'pronto_proximo_degrau' then format('Aplicar próximo degrau da meta: %s → %s (alvo %s)', meta_roas, proximo_degrau, round(meta_calc,1))
      when 'meta_desalinhada'      then 'Ajustar meta na Shopee (em degraus)'
      else 'Nenhuma ação'
    end,
    format('ROAS real %s vs mín %s · meta %s · fator %s%s%s%s',
      round(roas_real,1), round(roas_min,1), coalesce(meta_roas,0), round(fator,3),
      case when promo then ' · PROMO (não escalar)' else '' end,
      case when alerta_roas then ' · 🚨 3 dias abaixo de 0,7×mín' else '' end,
      case when censurado then format(' · teto: %s/7 dias esgotados', dias_esgotados) else '' end),
    promo, alerta_roas, round(ctr7,4), round(ctr28,4), round(cr7,4), round(cr28,4),
    round(roas_shopee28,2), round(gasto_medio_normal,2), dias_normais, dias_esgotados, censurado,
    orc_config,
    case
      when classificacao = 'sem_margem' then null
      when classificacao = 'abaixo_do_minimo' then 0
      when censurado and orc_config is not null then round(orc_config*1.25, 2)
      when mult is null or gasto_medio_normal is null then null
      else round(mult*gasto_medio_normal, 2)
    end,
    estado_janela, dias_restantes,
    case
      when classificacao = 'aprendizado' then format('aprendizado: faltam %s dia(s)', dias_restantes)
      when classificacao = 'estabilizacao' then format('estabilização: faltam %s dia(s) (meta alterada há %s dias); suprimida: %s',
        dias_restantes, dias_desde_meta, case when f_meta_nao_entregue then 'meta_nao_entregue' else 'meta_desalinhada' end)
      else null
    end
  from fin;

  get diagnostics v_n = row_count;
  return v_n;
end $$;
grant execute on function ads_recomendacoes_calc(uuid[], numeric) to anon, authenticated;
