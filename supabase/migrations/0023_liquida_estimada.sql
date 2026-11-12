-- Finanças: receita líquida de pedidos AINDA SEM extrato/escrow é estimada pelas taxas esperadas
-- (12/11/2026). Antes, a receita líquida só somava pedidos liquidados e o CMV somava todos os
-- pedidos pagos: no TikTok (extrato ~7 dias após a entrega) o lucro do mês saía negativo.
--   TikTok: comissão 10 % + R$ 4 (< R$ 50) ou 6 % + R$ 6 (>= R$ 50), + taxa de serviço 6 %,
--           + comissão de afiliado do pedido (tiktok_afiliado_pedidos), + frete médio cobrado
--           (média dos liquidados da loja em 30 d). Quando o extrato chega, o real substitui.
--   Shopee: valor_total × (líquido ÷ bruto dos pedidos com escrow da loja em 30 d).
alter table public.financas_resumo_diario add column if not exists receita_liquida_estimada numeric default 0;
alter table public.financas_resumo_diario add column if not exists qtd_liquidados integer default 0;
alter table public.financas_resumo_diario add column if not exists qtd_estimados integer default 0;

create or replace function public.liquida_estimada_tiktok(p_valor numeric, p_afiliado numeric default 0, p_frete_medio numeric default 0)
returns numeric
language sql
immutable
as $function$
  select round(p_valor
    - (case when p_valor < 50 then 0.10 * p_valor + 4 else 0.06 * p_valor + 6 end)  -- comissão
    - 0.06 * p_valor                                                                  -- taxa de serviço
    - coalesce(p_afiliado, 0) - coalesce(p_frete_medio, 0), 2);
$function$;

create or replace function public.rebuild_financas_dre()
returns void
language plpgsql
security definer
as $function$
begin
  delete from financas_resumo_diario where true;
  insert into financas_resumo_diario
    (loja_id, dia, uf, total_pedidos, receita_bruta, taxas, cupom_proprio, qtd_cupom,
     afiliado, qtd_afiliado, receita_liquida, taxa_servico_afiliado, cmv, unidades,
     itens_total, itens_com_custo, a_receber, qtd_a_receber, frete_custo,
     receita_liquida_estimada, qtd_liquidados, qtd_estimados)
  with params as (
    -- por loja: frete médio cobrado (TikTok) e razão líquido/bruto (Shopee), dos liquidados em 30 d
    select loja_id,
      coalesce(avg(frete_custo), 0) as frete_medio,
      coalesce(sum(valor_liquido) / nullif(sum(valor_total), 0), 0.72) as ratio
    from pedidos
    where pedido_efetivado and escrow_atualizado_em is not null
      and coalesce(data_pagamento, data_pedido) >= now() - interval '30 days'
    group by loja_id
  ),
  afil as (
    select loja_id, order_id, sum(coalesce(comissao_paga, comissao_estimada, 0)) as comissao
    from tiktok_afiliado_pedidos group by 1, 2
  ),
  base as (
    select p.*,
      case when p.escrow_atualizado_em is not null then null
           when p.marketplace = 'tiktok_shop' then liquida_estimada_tiktok(p.valor_total, a.comissao, pr.frete_medio)
           else round(p.valor_total * coalesce(pr.ratio, 0.72), 2) end as liquida_est
    from pedidos p
    left join params pr on pr.loja_id = p.loja_id
    left join afil a on a.loja_id = p.loja_id and a.order_id = p.pedido_externo_id
    where p.marketplace in ('shopee','tiktok_shop') and p.pedido_efetivado and coalesce(p.data_pagamento, p.data_pedido) is not null
  )
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
    count(*) filter (where p.recebido_em is null and coalesce(p.data_pagamento,p.data_pedido) >= now() - interval '45 days')::int,
    coalesce(sum(p.frete_custo),0),
    coalesce(sum(p.liquida_est) filter (where p.escrow_atualizado_em is null),0),
    count(*) filter (where p.escrow_atualizado_em is not null)::int,
    count(*) filter (where p.escrow_atualizado_em is null)::int
  from base p
  group by 1,2,3;

  delete from financas_recebido_diario where true;
  insert into financas_recebido_diario
  select loja_id, (recebido_em at time zone 'America/Sao_Paulo')::date, coalesce(sum(valor_recebido),0), count(*)::int
  from pedidos where marketplace in ('shopee','tiktok_shop') and recebido_em is not null group by 1,2;

  delete from previsao_lag where true;
  insert into previsao_lag
  select loja_id, uf, avg(lag), count(*)::int from (
    select loja_id, coalesce(uf,'—') as uf, extract(epoch from (recebido_em - data_pedido))/86400.0 as lag
    from pedidos where marketplace in ('shopee','tiktok_shop') and recebido_em is not null and data_pedido is not null
  ) x where lag between 0 and 90 group by 1,2;
  insert into previsao_lag
  select loja_id, 'GERAL', avg(lag), count(*)::int from (
    select loja_id, extract(epoch from (recebido_em - data_pedido))/86400.0 as lag
    from pedidos where marketplace in ('shopee','tiktok_shop') and recebido_em is not null and data_pedido is not null
  ) x where lag between 0 and 90 group by 1;
end $function$;

create or replace function public.resumo_financas(p_loja_ids uuid[] default null, p_inicio timestamptz default null, p_fim timestamptz default null, p_conta uuid default null)
returns json
language sql
stable
as $function$
  with di as (select (p_inicio at time zone 'America/Sao_Paulo')::date as ini, (p_fim at time zone 'America/Sao_Paulo')::date as fim),
  comp as (
    select coalesce(sum(receita_bruta),0) as receita_bruta, coalesce(sum(taxas),0) as taxas,
      coalesce(sum(cupom_proprio),0) as cupom_proprio, coalesce(sum(qtd_cupom),0) as qtd_cupom,
      coalesce(sum(afiliado),0) as afiliado, coalesce(sum(qtd_afiliado),0) as qtd_afiliado,
      coalesce(sum(taxa_servico_afiliado),0) as taxa_servico_afiliado,
      coalesce(sum(receita_liquida),0) as receita_liquida, coalesce(sum(total_pedidos),0) as total_pedidos,
      coalesce(sum(a_receber),0) as a_receber, coalesce(sum(qtd_a_receber),0) as qtd_a_receber,
      coalesce(sum(frete_custo),0) as frete_custo,
      coalesce(sum(receita_liquida_estimada),0) as receita_liquida_estimada,
      coalesce(sum(qtd_liquidados),0) as qtd_liquidados, coalesce(sum(qtd_estimados),0) as qtd_estimados
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
           coalesce(-sum(valor) filter (where categoria='reembolso'),0) as reembolsos,
           coalesce(-sum(valor) filter (where categoria='acelera_taxa'),0) as acelera_taxa,
           coalesce(-sum(valor) filter (where categoria='estorno'),0) as estornos,
           coalesce(sum(valor) filter (where categoria='compensacao'),0) as compensacoes,
           coalesce(-sum(valor) filter (where categoria='difal'),0) as difal,
           coalesce(-sum(valor) filter (where categoria in ('logistica_volumoso','logistica_peso','logistica_full','estorno_credito','ajuste_debito')),0) as ajustes,
           coalesce(-sum(valor) filter (where categoria='afiliado_ajuste'),0) as afiliado_ajuste,
           count(*) filter (where categoria='desconhecido') as desconhecidos
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
  tk as (
    select coalesce(sum(t.settlement),0) as reembolsos_tiktok
    from tiktok_transacoes t join tiktok_extratos e on e.id = t.statement_id
    where t.tipo <> 'ORDER'
      and (p_loja_ids is null or t.loja_id = any(p_loja_ids))
      and (p_inicio is null or e.statement_time >= p_inicio) and (p_fim is null or e.statement_time < p_fim)
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
    'receita_liquida_estimada',comp.receita_liquida_estimada,'qtd_liquidados',comp.qtd_liquidados,'qtd_estimados',comp.qtd_estimados,
    'recebido',cash.recebido,'qtd_recebido',cash.qtd_recebido,'a_receber',comp.a_receber,'qtd_a_receber',comp.qtd_a_receber,
    'ads',cart.ads,'reembolsos',cart.reembolsos,'imposto',imp.imposto,'por_uf',uf.j,
    'frete_custo',comp.frete_custo,'reembolsos_tiktok',tk.reembolsos_tiktok,
    'acelera_taxa',cart.acelera_taxa,'estornos',cart.estornos,'compensacoes',cart.compensacoes,'difal',cart.difal,
    'ajustes',cart.ajustes,'afiliado_ajuste',cart.afiliado_ajuste,'carteira_desconhecidos',cart.desconhecidos
  ) from comp,cash,cart,imp,uf,tk;
$function$;
