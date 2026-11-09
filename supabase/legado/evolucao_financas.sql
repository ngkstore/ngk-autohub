-- Evolução mensal do Balanço: receita, custos e margem de contribuição por mês,
-- pro Balanço mostrar tendência (subindo/caindo) em vez de só a foto do período.
-- Lê os resumos diários (leves). "resultado" = receita − taxas − afiliado −
-- cupom − CMV (margem de contribuição; ads/imposto ficam de fora do mensal).
create or replace function evolucao_mensal(p_loja_ids uuid[] default null, p_meses int default 6)
returns table(mes text, receita numeric, custos numeric, cmv numeric, resultado numeric, margem_pct numeric, pedidos int)
language sql stable as $$
  with corte as (
    select (date_trunc('month', now() at time zone 'America/Sao_Paulo') - ((p_meses - 1) || ' months')::interval)::date as ini
  ),
  fin as (
    select to_char(dia, 'YYYY-MM') as mes,
      sum(receita_bruta) as receita,
      sum(abs(taxas)) + sum(abs(afiliado)) + sum(abs(cupom_proprio)) as custos,
      sum(total_pedidos)::int as pedidos
    from financas_resumo_diario, corte
    where (p_loja_ids is null or loja_id = any(p_loja_ids)) and dia >= corte.ini
    group by 1
  ),
  cmv as (
    select to_char(dia, 'YYYY-MM') as mes, sum(cmv) as cmv
    from financas_cmv_diario, corte
    where (p_loja_ids is null or loja_id = any(p_loja_ids)) and dia >= corte.ini
    group by 1
  )
  select f.mes,
    round(f.receita, 0) as receita,
    round(f.custos, 0) as custos,
    round(coalesce(c.cmv, 0), 0) as cmv,
    round(f.receita - f.custos - coalesce(c.cmv, 0), 0) as resultado,
    round(case when f.receita > 0 then 100 * (f.receita - f.custos - coalesce(c.cmv, 0)) / f.receita else 0 end, 1) as margem_pct,
    f.pedidos
  from fin f left join cmv c on c.mes = f.mes
  order by f.mes;
$$;
grant execute on function evolucao_mensal(uuid[], int) to anon, authenticated;
