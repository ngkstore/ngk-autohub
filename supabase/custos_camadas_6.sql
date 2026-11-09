-- F1 (plano de melhorias 09/11/2026): precedência em custos_mensal.
-- "where c.soma or c.campo = 'repasse' and (...)" aplicava os filtros de loja e
-- período só às linhas de repasse; as linhas com soma=true vinham de todas as
-- lojas e datas. Agora os filtros valem para as duas.
set statement_timeout = '2min';

create or replace function custos_mensal(p_loja_ids uuid[] default null, p_inicio timestamptz default null, p_fim timestamptz default null)
returns json language sql stable as $$
  with ped as (
    select to_char(c.data_pedido at time zone 'America/Sao_Paulo', 'YYYY-MM') as mes, c.categoria, round(sum(c.valor),2) as valor,
           count(distinct c.order_sn) filter (where c.campo = 'repasse') as pedidos
    from custos_pedido c
    where (c.soma or c.campo = 'repasse')
      and (p_loja_ids is null or c.loja_id = any(p_loja_ids))
      and (p_inicio is null or c.data_pedido >= p_inicio) and (p_fim is null or c.data_pedido < p_fim)
    group by 1,2
  ),
  cart as (
    select to_char(t.criado_em at time zone 'America/Sao_Paulo', 'YYYY-MM') as mes, t.categoria, round(sum(t.valor),2) as valor, count(*) as qtd
    from carteira_transacoes t
    where (p_loja_ids is null or t.loja_id = any(p_loja_ids))
      and (p_inicio is null or t.criado_em >= p_inicio) and (p_fim is null or t.criado_em < p_fim)
    group by 1,2
  )
  select json_build_object(
    'pedido', (select coalesce(json_agg(row_to_json(p) order by p.mes, p.categoria), '[]'::json) from ped p),
    'carteira', (select coalesce(json_agg(json_build_object('mes', c.mes, 'categoria', c.categoria, 'rotulo', rotulo_categoria_carteira(c.categoria), 'valor', c.valor, 'qtd', c.qtd) order by c.mes, c.categoria), '[]'::json) from cart c)
  );
$$;
grant execute on function custos_mensal(uuid[], timestamptz, timestamptz) to anon, authenticated;
