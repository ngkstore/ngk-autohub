-- ============================================================================
-- RESUMO DIÁRIO DE FINANÇAS — pré-agrega DRE + CMV + variações + lag de previsão
-- para o Hub Finanças ler instantaneamente. As RPCs varriam a tabela gorda de
-- pedidos e desaninhavam o item_list -> 9s+, estourando o timeout de 8s do anon
-- (Finanças zerava). Reconstruído por cron (/api/shopee/pedidos/resumo-diario).
-- ============================================================================

create table if not exists financas_resumo_diario (
  loja_id uuid, dia date, uf text,
  total_pedidos int,
  receita_bruta numeric(14,2), taxas numeric(14,2), cupom_proprio numeric(14,2),
  qtd_cupom int, afiliado numeric(14,2), qtd_afiliado int, receita_liquida numeric(14,2),
  cmv numeric(14,2), unidades numeric, itens_total int, itens_com_custo int,
  a_receber numeric(14,2), qtd_a_receber int
);
create index if not exists frd_loja_dia_idx on financas_resumo_diario (loja_id, dia);

create table if not exists financas_recebido_diario (
  loja_id uuid, dia date, recebido numeric(14,2), qtd_recebido int
);
create index if not exists frcd_loja_dia_idx on financas_recebido_diario (loja_id, dia);

create table if not exists variacoes_resumo (
  loja_id uuid, item_id text, model_sku text, variacao text, un numeric, receita numeric(14,2)
);
create index if not exists vr_loja_idx on variacoes_resumo (loja_id);

create table if not exists previsao_lag (
  loja_id uuid, uf text, media_dias numeric, amostra int
);
create index if not exists pl_loja_idx on previsao_lag (loja_id);

create or replace function rebuild_financas_resumo_diario()
returns void language plpgsql security definer as $$
begin
  set local statement_timeout = '180s';

  -- itens desaninhados uma vez (all efetivado) num temp
  drop table if exists _fin_itens;
  create temp table _fin_itens as
    select p.loja_id,
      (coalesce(p.data_pagamento,p.data_pedido) at time zone 'America/Sao_Paulo')::date as dia,
      coalesce(p.uf,'—') as uf,
      (it->>'item_id') as item_id,
      upper(trim(it->>'model_sku')) as model_sku,
      (it->>'model_name') as variacao,
      greatest(coalesce(nullif(it->>'model_quantity_purchased','')::numeric, nullif(it->>'active_qty','')::numeric, 0)
        - coalesce(nullif(it->>'returned_qty','')::numeric,0) - coalesce(nullif(it->>'cancelled_qty','')::numeric,0), 0) as qtd,
      coalesce(cv.custo, pr.custo) as custo,
      case when coalesce(nullif(it->>'model_discounted_price','')::numeric,0) > 0
           then nullif(it->>'model_discounted_price','')::numeric
           else nullif(it->>'model_original_price','')::numeric end as preco
    from pedidos p
    cross join lateral jsonb_array_elements(
      case jsonb_typeof(p.dados_pedido->'item_list') when 'array' then p.dados_pedido->'item_list' else '[]'::jsonb end) it
    left join custos_variacao cv on cv.loja_id=p.loja_id and cv.model_sku=upper(trim(it->>'model_sku'))
    left join produtos pr on pr.loja_id=p.loja_id and pr.item_id=(it->>'item_id')
    where p.marketplace='shopee' and p.pedido_efetivado
      and coalesce(p.data_pagamento,p.data_pedido) is not null;

  -- 1) competência + a_receber por (loja, dia, uf)
  delete from financas_resumo_diario where true;
  insert into financas_resumo_diario
  select p.loja_id,
    (coalesce(p.data_pagamento, p.data_pedido) at time zone 'America/Sao_Paulo')::date as dia,
    coalesce(p.uf, '—') as uf,
    count(*)::int,
    coalesce(sum(p.valor_total),0),
    coalesce(sum(coalesce(p.taxa_comissao,0)+coalesce(p.taxa_servico,0)),0),
    coalesce(sum(p.cupom_loja),0),
    count(*) filter (where coalesce(p.cupom_loja,0) > 0)::int,
    coalesce(sum(p.comissao_afiliado),0),
    count(*) filter (where coalesce(p.comissao_afiliado,0) > 0)::int,
    coalesce(sum(p.valor_liquido) filter (where p.escrow_atualizado_em is not null),0),
    0,0,0,0,
    coalesce(sum(coalesce(p.valor_liquido, p.valor_total)) filter (where p.recebido_em is null and coalesce(p.data_pagamento,p.data_pedido) >= now() - interval '45 days'),0),
    count(*) filter (where p.recebido_em is null and coalesce(p.data_pagamento,p.data_pedido) >= now() - interval '45 days')::int
  from pedidos p
  where p.marketplace='shopee' and p.pedido_efetivado and coalesce(p.data_pagamento,p.data_pedido) is not null
  group by 1,2,3;

  -- 2) CMV/unidades/itens do temp
  with agg as (
    select loja_id, dia, uf,
      coalesce(sum(qtd*custo) filter (where custo is not null),0) as cmv,
      coalesce(sum(qtd),0) as unidades,
      count(*)::int as itens_total,
      count(*) filter (where custo is not null)::int as itens_com_custo
    from _fin_itens group by 1,2,3
  )
  update financas_resumo_diario f
  set cmv=agg.cmv, unidades=agg.unidades, itens_total=agg.itens_total, itens_com_custo=agg.itens_com_custo
  from agg where f.loja_id=agg.loja_id and f.dia=agg.dia and f.uf=agg.uf;

  -- 3) variações vendidas (90 dias) para o editor de custo
  delete from variacoes_resumo where true;
  insert into variacoes_resumo
  select loja_id, item_id, model_sku, max(variacao), sum(qtd), sum(qtd*preco)
  from _fin_itens
  where dia >= ((now() at time zone 'America/Sao_Paulo')::date - 90) and coalesce(model_sku,'') <> ''
  group by 1,2,3;

  -- 4) recebido (caixa) por (loja, dia_recebido)
  delete from financas_recebido_diario where true;
  insert into financas_recebido_diario
  select loja_id, (recebido_em at time zone 'America/Sao_Paulo')::date, coalesce(sum(valor_recebido),0), count(*)::int
  from pedidos where marketplace='shopee' and recebido_em is not null
  group by 1,2;

  -- 5) lag de recebimento por (loja, uf) + linha GERAL, para a previsão
  delete from previsao_lag where true;
  insert into previsao_lag
  select loja_id, uf, avg(lag), count(*)::int from (
    select loja_id, coalesce(uf,'—') as uf,
      extract(epoch from (recebido_em - data_pedido))/86400.0 as lag
    from pedidos where marketplace='shopee' and recebido_em is not null and data_pedido is not null
  ) x where lag between 0 and 90 group by 1,2;
  insert into previsao_lag
  select loja_id, 'GERAL', avg(lag), count(*)::int from (
    select loja_id, extract(epoch from (recebido_em - data_pedido))/86400.0 as lag
    from pedidos where marketplace='shopee' and recebido_em is not null and data_pedido is not null
  ) x where lag between 0 and 90 group by 1;

  drop table if exists _fin_itens;
end $$;
grant execute on function rebuild_financas_resumo_diario() to anon, authenticated;

-- ---------------------------------------------------------------------------
create or replace function resumo_financas(p_loja_ids uuid[] default null, p_inicio timestamptz default null, p_fim timestamptz default null, p_conta uuid default null)
returns json language sql stable as $$
  with di as (select (p_inicio at time zone 'America/Sao_Paulo')::date as ini, (p_fim at time zone 'America/Sao_Paulo')::date as fim),
  comp as (
    select coalesce(sum(receita_bruta),0) as receita_bruta, coalesce(sum(taxas),0) as taxas,
      coalesce(sum(cupom_proprio),0) as cupom_proprio, coalesce(sum(qtd_cupom),0) as qtd_cupom,
      coalesce(sum(afiliado),0) as afiliado, coalesce(sum(qtd_afiliado),0) as qtd_afiliado,
      coalesce(sum(receita_liquida),0) as receita_liquida, coalesce(sum(total_pedidos),0) as total_pedidos,
      coalesce(sum(a_receber),0) as a_receber, coalesce(sum(qtd_a_receber),0) as qtd_a_receber
    from financas_resumo_diario f, di
    where (p_loja_ids is null or f.loja_id = any(p_loja_ids))
      and (p_inicio is null or f.dia >= di.ini) and (p_fim is null or f.dia < di.fim)
  ),
  cash as (
    select coalesce(sum(recebido),0) as recebido, coalesce(sum(qtd_recebido),0) as qtd_recebido
    from financas_recebido_diario r, di
    where (p_loja_ids is null or r.loja_id = any(p_loja_ids))
      and (p_inicio is null or r.dia >= di.ini) and (p_fim is null or r.dia < di.fim)
  ),
  cart as (
    select coalesce(-sum(valor) filter (where categoria='ads'),0) as ads,
           coalesce(-sum(valor) filter (where categoria='reembolso'),0) as reembolsos
    from carteira_transacoes
    where (p_loja_ids is null or loja_id = any(p_loja_ids))
      and (p_inicio is null or criado_em >= p_inicio) and (p_fim is null or criado_em < p_fim)
  ),
  imp as (
    select coalesce(sum(valor),0) as imposto from impostos
    where p_conta is not null and conta_id = p_conta
      and (p_inicio is null or (competencia||'-01')::timestamptz >= date_trunc('month', p_inicio))
      and (p_fim is null or (competencia||'-01')::timestamptz < p_fim)
  ),
  uf as (
    select coalesce(json_agg(json_build_object('uf', u, 'pedidos', q, 'valor', v) order by v desc), '[]'::json) as j
    from (select f.uf as u, sum(f.total_pedidos)::int as q, coalesce(sum(f.receita_bruta),0) as v
          from financas_resumo_diario f, di
          where (p_loja_ids is null or f.loja_id = any(p_loja_ids))
            and (p_inicio is null or f.dia >= di.ini) and (p_fim is null or f.dia < di.fim)
          group by f.uf) t
  )
  select json_build_object(
    'receita_bruta',comp.receita_bruta,'taxas',comp.taxas,'cupom_proprio',comp.cupom_proprio,'qtd_cupom',comp.qtd_cupom,
    'afiliado',comp.afiliado,'qtd_afiliado',comp.qtd_afiliado,'receita_liquida',comp.receita_liquida,'total_pedidos',comp.total_pedidos,
    'recebido',cash.recebido,'qtd_recebido',cash.qtd_recebido,'a_receber',comp.a_receber,'qtd_a_receber',comp.qtd_a_receber,
    'ads',cart.ads,'reembolsos',cart.reembolsos,'imposto',imp.imposto,'por_uf',uf.j
  ) from comp,cash,cart,imp,uf;
$$;
grant execute on function resumo_financas(uuid[], timestamptz, timestamptz, uuid) to anon, authenticated;

create or replace function resumo_cmv(p_loja_ids uuid[] default null, p_inicio timestamptz default null, p_fim timestamptz default null)
returns json language sql stable as $$
  with di as (select (p_inicio at time zone 'America/Sao_Paulo')::date as ini, (p_fim at time zone 'America/Sao_Paulo')::date as fim)
  select json_build_object(
    'cmv', coalesce(sum(cmv),0), 'unidades', coalesce(sum(unidades),0),
    'itens_total', coalesce(sum(itens_total),0), 'itens_com_custo', coalesce(sum(itens_com_custo),0),
    'itens_sem_custo', coalesce(sum(itens_total),0) - coalesce(sum(itens_com_custo),0)
  )
  from financas_resumo_diario f, di
  where (p_loja_ids is null or f.loja_id = any(p_loja_ids))
    and (p_inicio is null or f.dia >= di.ini) and (p_fim is null or f.dia < di.fim);
$$;
grant execute on function resumo_cmv(uuid[], timestamptz, timestamptz) to anon, authenticated;

-- variações lê da tabela pré-agregada + custo atual (custos_variacao é pequena)
create or replace function variacoes_custo(p_loja_ids uuid[] default null)
returns json language sql stable as $$
  select coalesce(json_agg(json_build_object(
    'loja_id', v.loja_id, 'loja', coalesce(l.apelido,l.nome),
    'item_sku', pr.sku, 'item_nome', pr.nome, 'model_sku', v.model_sku,
    'variacao', v.variacao, 'un', v.un::int,
    'preco_med', round((v.receita/nullif(v.un,0))::numeric,2),
    'custo', cv.custo, 'custo_item', pr.custo
  ) order by v.un desc), '[]'::json)
  from variacoes_resumo v
  join produtos pr on pr.loja_id=v.loja_id and pr.item_id=v.item_id
  join lojas l on l.id=v.loja_id
  left join custos_variacao cv on cv.loja_id=v.loja_id and cv.model_sku=v.model_sku
  where (p_loja_ids is null or v.loja_id = any(p_loja_ids));
$$;
grant execute on function variacoes_custo(uuid[]) to anon, authenticated;

-- previsão projeta o a_receber (por dia/uf) usando o lag médio de recebimento
drop function if exists previsao_fluxo_caixa(uuid[], int);
create or replace function previsao_fluxo_caixa(p_loja_ids uuid[] default null, p_dias int default 30)
returns json language sql stable as $$
  with lg as (
    select uf, avg(media_dias) as media_dias, sum(amostra)::int as amostra
    from previsao_lag where (p_loja_ids is null or loja_id = any(p_loja_ids)) group by uf
  ),
  geral as (select media_dias, amostra from lg where uf='GERAL'),
  abertos as (
    select f.dia, f.uf, f.a_receber as valor, f.qtd_a_receber as qtd,
      coalesce((select round(l.media_dias) from lg l where l.uf=f.uf and l.amostra>=5),
               (select round(media_dias) from geral), 7) as lag
    from financas_resumo_diario f
    where (p_loja_ids is null or f.loja_id = any(p_loja_ids)) and f.a_receber > 0
  ),
  previsto as (select (dia + (lag::int)) as data_prev, valor, qtd from abertos),
  hoje as (select (now() at time zone 'America/Sao_Paulo')::date as d),
  por_dia as (select data_prev as diap, sum(valor) as valor, sum(qtd)::int as pedidos
    from previsto, hoje where data_prev >= hoje.d and data_prev < hoje.d + p_dias group by 1),
  atrasado as (select coalesce(sum(valor),0) as valor, coalesce(sum(qtd),0)::int as pedidos
    from previsto, hoje where data_prev < hoje.d)
  select json_build_object(
    'media_geral_dias', (select round(media_dias::numeric,1) from geral),
    'base_amostra', (select amostra from geral),
    'total_a_receber', (select coalesce(sum(valor),0) from abertos),
    'qtd_a_receber', (select coalesce(sum(qtd),0)::int from abertos),
    'atrasado_valor', (select valor from atrasado), 'atrasado_pedidos', (select pedidos from atrasado),
    'proximos_dias', (select coalesce(json_agg(json_build_object('dia',to_char(diap,'YYYY-MM-DD'),'valor',valor,'pedidos',pedidos) order by diap),'[]'::json) from por_dia),
    'por_uf', (select coalesce(json_agg(json_build_object('uf',uf,'dias',round(media_dias::numeric,1),'amostra',amostra) order by amostra desc),'[]'::json) from lg where uf<>'GERAL' and amostra>=5)
  );
$$;
grant execute on function previsao_fluxo_caixa(uuid[], int) to anon, authenticated;

select rebuild_pedidos_resumo_diario();
select rebuild_financas_resumo_diario();
