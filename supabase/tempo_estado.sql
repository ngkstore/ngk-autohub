-- Tempo de entrega por estado + evolução no tempo. Usa entregue_em − data_pedido
-- (dias até entregar), agora que a UF e as datas vêm do rastreio. Janela recente
-- e uniforme (mesmos p_dias pra todos os estados) pra comparação justa.

-- Média por estado numa janela recente (uniforme).
create or replace function tempo_por_estado(p_loja_ids uuid[] default null, p_dias int default 60)
returns table(uf text, media_dias numeric, amostra int)
language sql stable as $$
  select uf,
    round(avg(extract(epoch from (entregue_em - data_pedido)) / 86400.0)::numeric, 1) as media_dias,
    count(*)::int as amostra
  from pedidos
  where marketplace = 'shopee' and pedido_efetivado
    and entregue_em is not null and data_pedido is not null and uf is not null
    and entregue_em >= now() - (p_dias || ' days')::interval
    and extract(epoch from (entregue_em - data_pedido)) / 86400.0 between 0 and 90
    and (p_loja_ids is null or loja_id = any(p_loja_ids))
  group by uf;
$$;
grant execute on function tempo_por_estado(uuid[], int) to anon, authenticated;

-- Evolução semanal do tempo de entrega (um estado, ou todos se p_uf null).
create or replace function evolucao_entrega(p_loja_ids uuid[] default null, p_uf text default null, p_semanas int default 12)
returns table(semana date, media_dias numeric, amostra int)
language sql stable as $$
  select date_trunc('week', entregue_em at time zone 'America/Sao_Paulo')::date as semana,
    round(avg(extract(epoch from (entregue_em - data_pedido)) / 86400.0)::numeric, 1) as media_dias,
    count(*)::int as amostra
  from pedidos
  where marketplace = 'shopee' and pedido_efetivado
    and entregue_em is not null and data_pedido is not null
    and (p_uf is null or uf = p_uf)
    and entregue_em >= now() - ((p_semanas * 7) || ' days')::interval
    and extract(epoch from (entregue_em - data_pedido)) / 86400.0 between 0 and 90
    and (p_loja_ids is null or loja_id = any(p_loja_ids))
  group by 1 order by 1;
$$;
grant execute on function evolucao_entrega(uuid[], text, int) to anon, authenticated;
