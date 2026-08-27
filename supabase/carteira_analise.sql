-- ============================================================================
-- Carteira: saldo por loja + heatmap de "quando o dinheiro entra".
-- Substitui a leitura antiga que mostrava o saldo de UMA transação só (ficava
-- ambíguo com 2 lojas). Agora: saldo atual de CADA loja + padrão de entrada
-- por dia-da-semana × hora (usa o create_time real da transação).
-- ============================================================================

-- Saldo atual por loja = saldo da transação mais recente de cada loja.
create or replace function carteira_saldos(p_loja_ids uuid[] default null)
returns table(loja_id uuid, nome text, saldo numeric, atualizado_em timestamptz)
language sql stable as $$
  select distinct on (t.loja_id) t.loja_id, l.nome, t.saldo, t.criado_em
  from carteira_transacoes t
  join lojas l on l.id = t.loja_id
  where (p_loja_ids is null or t.loja_id = any(p_loja_ids))
  order by t.loja_id, t.criado_em desc;
$$;
grant execute on function carteira_saldos(uuid[]) to anon, authenticated;

-- Movimento LÍQUIDO por dia da semana, como MÉDIA de um dia típico (não a
-- soma do período — senão infla). entrou (valor>0: vendas + antecipação) e
-- saiu (valor<0: saques/PIX + ads + reembolsos), divididos pelo nº de vezes
-- que aquele dia-da-semana apareceu no período (calendário).
create or replace function carteira_movimento_dia(p_loja_ids uuid[] default null, p_dias int default 60)
returns table(dow int, entrou numeric, saiu numeric)
language sql stable as $$
  with cal as (
    select extract(dow from d)::int as dow, count(*)::numeric as n
    from generate_series(
      ((now() - (p_dias || ' days')::interval) at time zone 'America/Sao_Paulo')::date,
      (now() at time zone 'America/Sao_Paulo')::date,
      interval '1 day'
    ) d
    group by 1
  ),
  agg as (
    select
      extract(dow from criado_em at time zone 'America/Sao_Paulo')::int as dow,
      coalesce(sum(valor) filter (where valor > 0), 0) as entrou,
      coalesce(sum(valor) filter (where valor < 0), 0) as saiu
    from carteira_transacoes
    where criado_em >= now() - (p_dias || ' days')::interval
      and (p_loja_ids is null or loja_id = any(p_loja_ids))
    group by 1
  )
  select c.dow,
    round(coalesce(a.entrou, 0) / greatest(c.n, 1), 2) as entrou,
    round(coalesce(a.saiu, 0)   / greatest(c.n, 1), 2) as saiu
  from cal c left join agg a on a.dow = c.dow;
$$;
grant execute on function carteira_movimento_dia(uuid[], int) to anon, authenticated;

-- Heatmap das ENTRADAS (renda) por dia-da-semana (0=Dom..6=Sáb) × hora (BRT),
-- nos últimos p_dias. Cada célula: total em R$ e quantidade.
create or replace function carteira_entrada_heatmap(p_loja_ids uuid[] default null, p_dias int default 60)
returns table(dow int, hora int, total numeric, qtd int)
language sql stable as $$
  select
    extract(dow  from criado_em at time zone 'America/Sao_Paulo')::int as dow,
    extract(hour from criado_em at time zone 'America/Sao_Paulo')::int as hora,
    coalesce(sum(valor),0) as total,
    count(*)::int as qtd
  from carteira_transacoes
  where categoria = 'renda' and valor > 0
    and criado_em >= now() - (p_dias || ' days')::interval
    and (p_loja_ids is null or loja_id = any(p_loja_ids))
  group by 1, 2;
$$;
grant execute on function carteira_entrada_heatmap(uuid[], int) to anon, authenticated;
