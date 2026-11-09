-- ============================================================================
-- Split do rebuild de finanças em LEVE (DRE) e PESADO (CMV).
--
-- Problema: rebuild_financas_resumo_diario() fazia tudo junto — inclusive
-- desaninhar o item_list de ~70k pedidos (JSON gordo) → >100s → saturava o
-- banco (Nano, ~1GB RAM). Rodando de hora em hora, derrubava o sistema (504).
--
-- Solução: separar as duas cargas.
--   * rebuild_financas_dre()  — LEVE (~6-7s): agregados de DRE direto das
--     colunas do pedido (sem unnest). Roda a cada 20 min via pg_cron.
--   * rebuild_financas_cmv()  — PESADO (~120s): desaninha item_list p/ CMV e
--     variações. Grava em tabela PRÓPRIA (financas_cmv_diario). Roda 4x/dia.
--
-- Assim o dado de DRE fica sempre fresco e barato; o CMV/lucro fica no máx.
-- ~6h defasado, mas a carga pesada só bate 4x/dia (não satura mais).
-- Fix permanente pendente: tabela magra pedido_itens (mata o unnest de vez).
-- ============================================================================

-- Tabela própria do CMV (desacopla da financas_resumo_diario, que o job leve
-- reescreve por completo a cada 20 min).
create table if not exists financas_cmv_diario (
  loja_id uuid not null,
  dia date not null,
  uf text not null default '—',
  cmv numeric(14,2) not null default 0,
  unidades numeric(14,2) not null default 0,
  itens_total int not null default 0,
  itens_com_custo int not null default 0,
  primary key (loja_id, dia, uf)
);

-- ------------------------------------------------------------------ LEVE (DRE)
create or replace function rebuild_financas_dre()
returns void language plpgsql security definer as $$
begin
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
    0,0,0,0,  -- cmv/unidades/itens_total/itens_com_custo agora vivem em financas_cmv_diario
    coalesce(sum(coalesce(p.valor_liquido, p.valor_total)) filter (where p.recebido_em is null and coalesce(p.data_pagamento,p.data_pedido) >= now() - interval '45 days'),0),
    count(*) filter (where p.recebido_em is null and coalesce(p.data_pagamento,p.data_pedido) >= now() - interval '45 days')::int
  from pedidos p
  where p.marketplace='shopee' and p.pedido_efetivado and coalesce(p.data_pagamento,p.data_pedido) is not null
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
end $$;
grant execute on function rebuild_financas_dre() to anon, authenticated;

-- --------------------------------------------------------------- PESADO (CMV)
create or replace function rebuild_financas_cmv()
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

  delete from financas_cmv_diario where true;
  insert into financas_cmv_diario (loja_id, dia, uf, cmv, unidades, itens_total, itens_com_custo)
  select loja_id, dia, uf,
    coalesce(sum(qtd*custo) filter (where custo is not null),0),
    coalesce(sum(qtd),0), count(*)::int,
    count(*) filter (where custo is not null)::int
  from _fin_itens group by 1,2,3;

  delete from variacoes_resumo where true;
  insert into variacoes_resumo
  select loja_id, item_id, model_sku, max(variacao), sum(qtd), sum(qtd*preco)
  from _fin_itens
  where dia >= ((now() at time zone 'America/Sao_Paulo')::date - 90) and coalesce(model_sku,'') <> ''
  group by 1,2,3;

  drop table if exists _fin_itens;
end $$;
grant execute on function rebuild_financas_cmv() to anon, authenticated;

-- Wrapper: mantém o nome antigo funcionando (chama os dois). Usado só em
-- rebuild manual/completo — NÃO agendar este (é a soma leve+pesado).
create or replace function rebuild_financas_resumo_diario()
returns void language plpgsql security definer as $$
begin
  perform rebuild_financas_dre();
  perform rebuild_financas_cmv();
end $$;
grant execute on function rebuild_financas_resumo_diario() to anon, authenticated;

-- resumo_cmv passa a ler a tabela própria financas_cmv_diario.
-- APLICAR SÓ DEPOIS de popular a tabela (senão CMV mostra 0 até o 1o rebuild).
create or replace function resumo_cmv(p_loja_ids uuid[] default null, p_inicio timestamptz default null, p_fim timestamptz default null)
returns json language sql stable as $$
  with di as (select (p_inicio at time zone 'America/Sao_Paulo')::date as ini, (p_fim at time zone 'America/Sao_Paulo')::date as fim)
  select json_build_object(
    'cmv', coalesce(sum(cmv),0), 'unidades', coalesce(sum(unidades),0),
    'itens_total', coalesce(sum(itens_total),0), 'itens_com_custo', coalesce(sum(itens_com_custo),0),
    'itens_sem_custo', coalesce(sum(itens_total),0) - coalesce(sum(itens_com_custo),0)
  )
  from financas_cmv_diario f, di
  where (p_loja_ids is null or f.loja_id = any(p_loja_ids))
    and (p_inicio is null or f.dia >= di.ini) and (p_fim is null or f.dia < di.fim);
$$;
grant execute on function resumo_cmv(uuid[], timestamptz, timestamptz) to anon, authenticated;

-- Agendamento pg_cron (aplicar via cron.schedule, não faz parte deste replace):
--   select cron.schedule('rebuild-financas-dre', '10,30,50 * * * *', 'select rebuild_financas_dre();');
--   select cron.schedule('rebuild-financas-cmv', '15 3,9,15,21 * * *', 'select rebuild_financas_cmv();');
-- (rebuild-pedidos continua em '*/20 * * * *' = 0,20,40, sem sobrepor o DRE.)
