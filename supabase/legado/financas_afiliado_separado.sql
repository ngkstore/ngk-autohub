alter table financas_resumo_diario add column if not exists taxa_servico_afiliado numeric(14,2);

create or replace function rebuild_financas_resumo_diario()
returns void language plpgsql security definer as $$
begin
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

  delete from financas_resumo_diario where true;
  insert into financas_resumo_diario
    (loja_id, dia, uf, total_pedidos, receita_bruta, taxas, cupom_proprio, qtd_cupom,
     afiliado, qtd_afiliado, receita_liquida, taxa_servico_afiliado, cmv, unidades,
     itens_total, itens_com_custo, a_receber, qtd_a_receber)
  select p.loja_id,
    (coalesce(p.data_pagamento, p.data_pedido) at time zone 'America/Sao_Paulo')::date,
    coalesce(p.uf, '—'),
    count(*)::int,
    coalesce(sum(p.valor_total),0),
    coalesce(sum(coalesce(p.taxa_comissao,0)+coalesce(p.taxa_servico,0)),0),
    coalesce(sum(p.cupom_loja),0),
    count(*) filter (where coalesce(p.cupom_loja,0) > 0)::int,
    coalesce(sum(p.comissao_afiliado),0),
    count(*) filter (where coalesce(p.comissao_afiliado,0) > 0)::int,
    coalesce(sum(p.valor_liquido) filter (where p.escrow_atualizado_em is not null),0),
    coalesce(sum(p.taxa_servico_afiliado),0),
    0,0,0,0,
    coalesce(sum(coalesce(p.valor_liquido, p.valor_total)) filter (where p.recebido_em is null and coalesce(p.data_pagamento,p.data_pedido) >= now() - interval '45 days'),0),
    count(*) filter (where p.recebido_em is null and coalesce(p.data_pagamento,p.data_pedido) >= now() - interval '45 days')::int
  from pedidos p
  where p.marketplace='shopee' and p.pedido_efetivado and coalesce(p.data_pagamento,p.data_pedido) is not null
  group by 1,2,3;

  with agg as (
    select loja_id, dia, uf,
      coalesce(sum(qtd*custo) filter (where custo is not null),0) as cmv,
      coalesce(sum(qtd),0) as unidades, count(*)::int as itens_total,
      count(*) filter (where custo is not null)::int as itens_com_custo
    from _fin_itens group by 1,2,3
  )
  update financas_resumo_diario f
  set cmv=agg.cmv, unidades=agg.unidades, itens_total=agg.itens_total, itens_com_custo=agg.itens_com_custo
  from agg where f.loja_id=agg.loja_id and f.dia=agg.dia and f.uf=agg.uf;

  delete from variacoes_resumo where true;
  insert into variacoes_resumo
  select loja_id, item_id, model_sku, max(variacao), sum(qtd), sum(qtd*preco)
  from _fin_itens
  where dia >= ((now() at time zone 'America/Sao_Paulo')::date - 90) and coalesce(model_sku,'') <> ''
  group by 1,2,3;

  delete from financas_recebido_diario where true;
  insert into financas_recebido_diario
  select loja_id, (recebido_em at time zone 'America/Sao_Paulo')::date, coalesce(sum(valor_recebido),0), count(*)::int
  from pedidos where marketplace='shopee' and recebido_em is not null group by 1,2;

  delete from previsao_lag where true;
  insert into previsao_lag
  select loja_id, uf, avg(lag), count(*)::int from (
    select loja_id, coalesce(uf,'—') as uf, extract(epoch from (recebido_em - data_pedido))/86400.0 as lag
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

create or replace function resumo_financas(p_loja_ids uuid[] default null, p_inicio timestamptz default null, p_fim timestamptz default null, p_conta uuid default null)
returns json language sql stable as $$
  with di as (select (p_inicio at time zone 'America/Sao_Paulo')::date as ini, (p_fim at time zone 'America/Sao_Paulo')::date as fim),
  comp as (
    select coalesce(sum(receita_bruta),0) as receita_bruta, coalesce(sum(taxas),0) as taxas,
      coalesce(sum(cupom_proprio),0) as cupom_proprio, coalesce(sum(qtd_cupom),0) as qtd_cupom,
      coalesce(sum(afiliado),0) as afiliado, coalesce(sum(qtd_afiliado),0) as qtd_afiliado,
      coalesce(sum(taxa_servico_afiliado),0) as taxa_servico_afiliado,
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
    'afiliado',comp.afiliado,'qtd_afiliado',comp.qtd_afiliado,'taxa_servico_afiliado',comp.taxa_servico_afiliado,
    'receita_liquida',comp.receita_liquida,'total_pedidos',comp.total_pedidos,
    'recebido',cash.recebido,'qtd_recebido',cash.qtd_recebido,'a_receber',comp.a_receber,'qtd_a_receber',comp.qtd_a_receber,
    'ads',cart.ads,'reembolsos',cart.reembolsos,'imposto',imp.imposto,'por_uf',uf.j
  ) from comp,cash,cart,imp,uf;
$$;
grant execute on function resumo_financas(uuid[], timestamptz, timestamptz, uuid) to anon, authenticated;
