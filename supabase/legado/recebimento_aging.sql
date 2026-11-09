-- Aging de recebimento: pedidos PAGOS (líquido>0) que ainda NÃO caíram na
-- carteira, agrupados por tempo de espera. A maioria liquida em ~60 dias, então
-- acima de 60d é "vencido" (passou do prazo normal → vale cobrar a Shopee).
--
-- Só pedidos ao vivo (origem null) e a partir do início da carteira DAQUELA loja
-- (cada loja conectou numa data; antes disso não há como casar → não é vencido).
-- Reverte (líquido=0) já sai por não ter líquido>0.
create or replace function recebimento_aging(p_loja_ids uuid[] default null)
returns json language sql stable as $$
  with cs as (
    select loja_id, min(criado_em) as ini from carteira_transacoes group by loja_id
  ),
  base as (
    select coalesce(p.valor_liquido, p.valor_total) as esperado,
           extract(epoch from (now() - p.data_pedido)) / 86400.0 as dias
    from pedidos p
    join cs on cs.loja_id = p.loja_id
    where p.marketplace = 'shopee' and p.pedido_efetivado and p.origem is null
      and coalesce(p.valor_liquido, 0) > 0 and p.recebido_em is null
      and p.data_pedido is not null and p.data_pedido >= cs.ini
      and (p_loja_ids is null or p.loja_id = any(p_loja_ids))
  )
  select json_build_object(
    'b0_30_qtd',  count(*) filter (where dias < 30),
    'b0_30_val',  coalesce(sum(esperado) filter (where dias < 30), 0),
    'b30_60_qtd', count(*) filter (where dias >= 30 and dias < 60),
    'b30_60_val', coalesce(sum(esperado) filter (where dias >= 30 and dias < 60), 0),
    'b60_qtd',    count(*) filter (where dias >= 60),
    'b60_val',    coalesce(sum(esperado) filter (where dias >= 60), 0)
  ) from base;
$$;
grant execute on function recebimento_aging(uuid[]) to anon, authenticated;
