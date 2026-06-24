-- Coluna data_pagamento (pay_time da Shopee) para o Dashboard bater com o
-- "Pedidos Pagos" (que é agrupado pela DATA DE PAGAMENTO, não de criação).
--
-- Rode UMA vez no Supabase -> SQL Editor -> Run (seguro rodar de novo).

alter table pedidos add column if not exists data_pagamento timestamptz;

-- Backfill a partir do pay_time (unix em segundos) salvo em dados_pedido.
update pedidos
set data_pagamento = to_timestamp(((dados_pedido::jsonb) ->> 'pay_time')::bigint)
where marketplace = 'shopee'
  and ((dados_pedido::jsonb) ->> 'pay_time') ~ '^[1-9][0-9]*$';

create index if not exists idx_pedidos_data_pagamento
  on pedidos (data_pagamento);
