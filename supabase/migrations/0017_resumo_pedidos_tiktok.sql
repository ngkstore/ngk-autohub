-- Visão geral: o resumo diário de pedidos só somava marketplace='shopee', então as lojas
-- TikTok apareciam com R$ 0 e 0 pedidos em qualquer período. Passa a incluir tiktok_shop
-- com a MESMA regra de Finanças (rebuild_financas_dre): dia pelo pay_time (BRT),
-- valor_total (merchant_subtotal na Shopee; subtotal pago no TikTok), pedido_efetivado = pago.
create or replace function public.rebuild_pedidos_resumo_diario()
returns void
language plpgsql
security definer
as $function$
begin
  set local statement_timeout = '120s';
  delete from pedidos_resumo_diario where true;
  insert into pedidos_resumo_diario (loja_id, dia, status, efetivado, faturado, qtd, valor)
  select loja_id,
    (coalesce(data_pagamento, data_pedido) at time zone 'America/Sao_Paulo')::date as dia,
    coalesce(status,'UNKNOWN') as status,
    coalesce(pedido_efetivado,false) as efetivado,
    coalesce(entra_faturamento,false) as faturado,
    count(*)::int as qtd, coalesce(sum(valor_total),0) as valor
  from pedidos
  where marketplace in ('shopee','tiktok_shop') and coalesce(data_pagamento,data_pedido) is not null
  group by 1,2,3,4,5;
end $function$;

-- Conferência "tela × banco": soma direta em pedidos com a mesma regra, para os testes
-- compararem com resumo_pedidos (que lê a tabela derivada).
create or replace function public.conferencia_resumo_pedidos(
  p_loja_ids uuid[] default null,
  p_inicio timestamptz default null,
  p_fim timestamptz default null
) returns json
language sql
stable
as $function$
  -- p_inicio/p_fim devem ser meia-noite BRT (como a tela manda); o filtro direto no timestamp
  -- usa o índice pedidos_resumo_dt (loja_id, coalesce(data_pagamento, data_pedido)).
  select json_build_object(
    'total_pedidos', count(*),
    'pedidos_efetivados', count(*) filter (where p.pedido_efetivado),
    'faturamento_efetivado', coalesce(sum(p.valor_total) filter (where p.pedido_efetivado), 0)
  )
  from pedidos p
  where p.marketplace in ('shopee','tiktok_shop')
    and (p_loja_ids is null or p.loja_id = any(p_loja_ids))
    and (p_inicio is null or coalesce(p.data_pagamento, p.data_pedido) >= p_inicio)
    and (p_fim is null or coalesce(p.data_pagamento, p.data_pedido) < p_fim);
$function$;
