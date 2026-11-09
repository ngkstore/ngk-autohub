-- F6 (plano de melhorias 09/11/2026): topo do DRE a partir das linhas do detalhamento
-- (custos_pedido), por categoria, com a cobertura (quantos pedidos do período têm
-- detalhamento). A página usa estas linhas quando a cobertura é alta e mostra a
-- "diferença não mapeada" (soma dos resíduos), que deve ficar perto de zero.
set statement_timeout = '2min';

create or replace function custos_resumo_dre(p_loja_ids uuid[] default null, p_inicio timestamptz default null, p_fim timestamptz default null)
returns json language sql stable as $$
  with c as (
    select c.categoria, c.campo, c.valor, c.soma, c.order_sn
    from custos_pedido c
    where (p_loja_ids is null or c.loja_id = any(p_loja_ids))
      and (p_inicio is null or c.data_pedido >= p_inicio) and (p_fim is null or c.data_pedido < p_fim)
  ),
  ped as (
    select count(*) as total
    from pedidos p
    where p.marketplace = 'shopee' and p.pedido_efetivado and p.pedido_externo_id not like 'SH-%'
      and (p_loja_ids is null or p.loja_id = any(p_loja_ids))
      and (p_inicio is null or p.data_pedido >= p_inicio) and (p_fim is null or p.data_pedido < p_fim)
  )
  select json_build_object(
    'pedidos', (select total from ped),
    'com_detalhamento', (select count(distinct order_sn) from c where campo = 'repasse'),
    'receita', (select coalesce(sum(valor),0) from c where categoria = 'receita'),
    'desconto_pix', (select coalesce(sum(valor),0) from c where categoria = 'desconto_pix'),
    'cupom_vendedor', (select coalesce(sum(valor),0) from c where categoria = 'cupom_vendedor'),
    'cupom_shopee', (select coalesce(sum(valor),0) from c where categoria = 'cupom_shopee'),
    'acao_comercial', (select coalesce(sum(valor),0) from c where categoria = 'acao_comercial'),
    'frete', (select coalesce(sum(valor),0) from c where categoria = 'frete' and soma),
    'comissao', (select coalesce(sum(valor),0) from c where categoria = 'comissao'),
    'comissao_rebate', (select coalesce(sum(valor),0) from c where categoria = 'comissao_rebate'),
    'serv_transacao', (select coalesce(sum(valor),0) from c where categoria = 'serv_transacao'),
    'serv_item', (select coalesce(sum(valor),0) from c where categoria = 'serv_item'),
    'serv_outros', (select coalesce(sum(valor),0) from c where categoria = 'serv_outros'),
    'serv_afiliado', (select coalesce(sum(valor),0) from c where categoria = 'serv_afiliado'),
    'afiliado', (select coalesce(sum(valor),0) from c where categoria = 'afiliado'),
    'taxa_outros', (select coalesce(sum(valor),0) from c where categoria = 'taxa_outros'),
    'compensacao', (select coalesce(sum(valor),0) from c where categoria = 'compensacao' and soma),
    'repasse', (select coalesce(sum(valor),0) from c where campo = 'repasse'),
    'residual', (select coalesce(sum(valor),0) from c where campo = 'residual')
  );
$$;
grant execute on function custos_resumo_dre(uuid[], timestamptz, timestamptz) to anon, authenticated;
