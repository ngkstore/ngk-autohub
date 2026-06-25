-- Resumo financeiro (conciliação via escrow). Soma tudo no banco, sem limite
-- de 1000 linhas. Considera só pedidos JÁ conciliados (escrow_atualizado_em).
-- Filtra por loja/período (data de pagamento, igual ao Dashboard).
--
-- Rode UMA vez no Supabase -> SQL Editor -> Run (seguro rodar de novo).

create or replace function resumo_financeiro(
  p_loja_id uuid default null,
  p_inicio timestamptz default null,
  p_fim timestamptz default null
)
returns json
language sql
stable
as $$
  with base as (
    select *
    from pedidos
    where marketplace = 'shopee'
      and escrow_atualizado_em is not null
      and (p_loja_id is null or loja_id = p_loja_id)
      and (p_inicio is null or coalesce(data_pagamento, data_pedido) >= p_inicio)
      and (p_fim is null or coalesce(data_pagamento, data_pedido) < p_fim)
  )
  select json_build_object(
    'pedidos', (select count(*) from base),
    'vendas', (select coalesce(sum(valor_total), 0) from base),
    'valor_pago', (select coalesce(sum(valor_pago), 0) from base),
    'valor_liquido', (select coalesce(sum(valor_liquido), 0) from base),
    'taxa_comissao', (select coalesce(sum(taxa_comissao), 0) from base),
    'taxa_servico', (select coalesce(sum(taxa_servico), 0) from base),
    'cupom_loja', (select coalesce(sum(cupom_loja), 0) from base),
    'cupom_shopee', (select coalesce(sum(cupom_shopee), 0) from base),
    'frete', (select coalesce(sum(frete), 0) from base),
    'desconto_vendedor', (select coalesce(sum(desconto_vendedor), 0) from base),
    'pendentes_conciliacao', (
      select count(*)
      from pedidos
      where marketplace = 'shopee'
        and pedido_efetivado = true
        and escrow_atualizado_em is null
        and (p_loja_id is null or loja_id = p_loja_id)
        and (p_inicio is null or coalesce(data_pagamento, data_pedido) >= p_inicio)
        and (p_fim is null or coalesce(data_pagamento, data_pedido) < p_fim)
    )
  );
$$;

grant execute on function resumo_financeiro(uuid, timestamptz, timestamptz) to anon, authenticated;
