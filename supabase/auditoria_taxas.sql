-- Auditoria de taxas: calcula a taxa ESPERADA (regra de comissão da loja) e
-- compara com a taxa REAL cobrada pela Shopee (comissão + serviço do escrow).
-- Faixas (sobre o valor da venda / mercadoria):
--   0–79,99    -> 20% + R$ 4
--   80–99,99   -> 14% + R$ 16
--   100–199,99 -> 14% + R$ 20
--   200+       -> 14% + R$ 26
--
-- Rode UMA vez no Supabase -> SQL Editor -> Run (seguro rodar de novo).

create or replace view pedidos_auditoria as
select
  p.id,
  p.loja_id,
  p.marketplace,
  p.pedido_externo_id,
  p.cliente_nome,
  p.valor_total,
  p.taxa_comissao,
  p.taxa_servico,
  p.valor_liquido,
  p.data_pagamento,
  p.data_pedido,
  round(
    (case
      when coalesce(p.valor_total, 0) < 80 then p.valor_total * 0.20 + 4
      when p.valor_total < 100 then p.valor_total * 0.14 + 16
      when p.valor_total < 200 then p.valor_total * 0.14 + 20
      else p.valor_total * 0.14 + 26
    end)::numeric,
    2
  ) as taxa_esperada,
  round(
    (coalesce(p.taxa_comissao, 0) + coalesce(p.taxa_servico, 0))::numeric,
    2
  ) as taxa_real,
  round(
    ((coalesce(p.taxa_comissao, 0) + coalesce(p.taxa_servico, 0)) -
      (case
        when coalesce(p.valor_total, 0) < 80 then p.valor_total * 0.20 + 4
        when p.valor_total < 100 then p.valor_total * 0.14 + 16
        when p.valor_total < 200 then p.valor_total * 0.14 + 20
        else p.valor_total * 0.14 + 26
      end))::numeric,
    2
  ) as taxa_diferenca
from pedidos p
where p.marketplace = 'shopee'
  and p.escrow_atualizado_em is not null
  and coalesce(p.valor_total, 0) > 0;

grant select on pedidos_auditoria to anon, authenticated;

-- Resumo agregado da auditoria (sem limite de 1000 linhas).
create or replace function auditoria_resumo(
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
    from pedidos_auditoria
    where (p_loja_id is null or loja_id = p_loja_id)
      and (p_inicio is null or coalesce(data_pagamento, data_pedido) >= p_inicio)
      and (p_fim is null or coalesce(data_pagamento, data_pedido) < p_fim)
  )
  select json_build_object(
    'pedidos', (select count(*) from base),
    'divergentes', (select count(*) from base where abs(taxa_diferenca) > 0.50),
    'taxa_esperada_total', (select coalesce(sum(taxa_esperada), 0) from base),
    'taxa_real_total', (select coalesce(sum(taxa_real), 0) from base),
    'diferenca_total', (select coalesce(sum(taxa_diferenca), 0) from base),
    'cobrado_a_mais', (
      select coalesce(sum(taxa_diferenca) filter (where taxa_diferenca > 0), 0) from base
    ),
    'cobrado_a_menos', (
      select coalesce(sum(taxa_diferenca) filter (where taxa_diferenca < 0), 0) from base
    )
  );
$$;

grant execute on function auditoria_resumo(uuid, timestamptz, timestamptz) to anon, authenticated;
