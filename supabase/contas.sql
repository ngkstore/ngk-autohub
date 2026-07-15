-- Separação por CONTA (multi-cliente). Cada conta é um dono (você e amigos).
-- Cada loja pertence a uma conta; cada usuário (e-mail de login) pertence a uma
-- conta. O app mostra só as lojas da conta do usuário logado (admin vê tudo).
-- Rode UMA vez no Supabase -> SQL Editor -> Run (seguro rodar de novo).

create table if not exists contas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  criado_em timestamptz default now()
);

-- Mapeia o e-mail de login (Supabase Auth) para uma conta. admin=true vê tudo.
create table if not exists conta_membros (
  email text primary key,
  conta_id uuid references contas(id),
  nome text,
  admin boolean default false,
  criado_em timestamptz default now()
);

alter table lojas add column if not exists conta_id uuid references contas(id);

-- Contas iniciais (IDs fixos p/ referência). Edite os nomes/e-mails depois.
insert into contas (id, nome) values
  ('a0000000-0000-4000-8000-000000000001', 'NGK Store (Gabriel)'),
  ('a0000000-0000-4000-8000-000000000002', 'Amigo 1 (editar)'),
  ('a0000000-0000-4000-8000-000000000003', 'Amigo 2 (editar)')
on conflict (id) do nothing;

-- Tudo que existe hoje é da sua conta.
update lojas
  set conta_id = 'a0000000-0000-4000-8000-000000000001'
  where conta_id is null;

-- Você: admin (vê todas as contas). Troque o e-mail se usar outro no login.
insert into conta_membros (email, conta_id, nome, admin) values
  ('acesso.ngk.store@gmail.com', 'a0000000-0000-4000-8000-000000000001', 'Gabriel', true)
on conflict (email) do update
  set conta_id = excluded.conta_id, admin = excluded.admin;

-- Placeholders dos amigos: troque o e-mail (o mesmo que eles usarão no login)
-- e o nome depois. Enquanto o e-mail for de exemplo, ninguém acessa por eles.
insert into conta_membros (email, conta_id, nome, admin) values
  ('amigo1@exemplo.com', 'a0000000-0000-4000-8000-000000000002', 'Amigo 1 (editar)', false),
  ('amigo2@exemplo.com', 'a0000000-0000-4000-8000-000000000003', 'Amigo 2 (editar)', false)
on conflict (email) do nothing;

-- ======================================================================
-- Funções de resumo: passam a aceitar LISTA de lojas (p_loja_ids).
--   null  = todas as lojas (usado pelo admin sem filtro)
--   {..}  = só as lojas informadas (a conta do usuário, ou a loja escolhida)
-- ======================================================================

drop function if exists resumo_pedidos(uuid, timestamptz, timestamptz);
create or replace function resumo_pedidos(
  p_loja_ids uuid[] default null,
  p_inicio timestamptz default null,
  p_fim timestamptz default null
)
returns json
language sql
stable
as $$
  with filtrados as (
    select *,
           coalesce(data_pagamento, data_pedido) as data_ref
    from pedidos
    where (p_loja_ids is null or loja_id = any(p_loja_ids))
      and (p_inicio is null or coalesce(data_pagamento, data_pedido) >= p_inicio)
      and (p_fim is null or coalesce(data_pagamento, data_pedido) < p_fim)
  )
  select json_build_object(
    'total_pedidos', (select count(*) from filtrados),
    'pedidos_efetivados', (select count(*) from filtrados where pedido_efetivado),
    'pedidos_faturados', (select count(*) from filtrados where entra_faturamento),
    'pedidos_cancelados', (select count(*) from filtrados
        where coalesce(pedido_efetivado, false) = false
          and coalesce(status, '') <> 'UNPAID'),
    'faturamento_geral', (select coalesce(sum(valor_total), 0) from filtrados),
    'faturamento_efetivado', (select coalesce(sum(valor_total), 0) from filtrados where pedido_efetivado),
    'faturamento_concluido', (select coalesce(sum(valor_total), 0) from filtrados where entra_faturamento),
    'por_status', (select coalesce(json_agg(
          json_build_object('status', status, 'quantidade', quantidade)
          order by quantidade desc), '[]'::json)
       from (select coalesce(status, 'UNKNOWN') as status, count(*)::int as quantidade
         from filtrados group by coalesce(status, 'UNKNOWN')) s),
    'por_marketplace', (select coalesce(json_agg(
          json_build_object('marketplace', marketplace, 'faturamento', faturamento)), '[]'::json)
       from (select coalesce(marketplace, 'sem marketplace') as marketplace,
                coalesce(sum(valor_total), 0) as faturamento
         from filtrados where pedido_efetivado
         group by coalesce(marketplace, 'sem marketplace')) m),
    'vendas_por_dia', (select coalesce(json_agg(
          json_build_object('dia', dia, 'faturamento', faturamento)
          order by dia), '[]'::json)
       from (select to_char((data_ref at time zone 'America/Sao_Paulo')::date, 'YYYY-MM-DD') as dia,
                coalesce(sum(valor_total), 0) as faturamento
         from filtrados where pedido_efetivado and data_ref is not null
         group by (data_ref at time zone 'America/Sao_Paulo')::date) v)
  );
$$;
grant execute on function resumo_pedidos(uuid[], timestamptz, timestamptz) to anon, authenticated;

drop function if exists resumo_financeiro(uuid, timestamptz, timestamptz);
create or replace function resumo_financeiro(
  p_loja_ids uuid[] default null,
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
      and (p_loja_ids is null or loja_id = any(p_loja_ids))
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
      select count(*) from pedidos
      where marketplace = 'shopee' and pedido_efetivado = true
        and escrow_atualizado_em is null
        and (p_loja_ids is null or loja_id = any(p_loja_ids))
        and (p_inicio is null or coalesce(data_pagamento, data_pedido) >= p_inicio)
        and (p_fim is null or coalesce(data_pagamento, data_pedido) < p_fim)
    )
  );
$$;
grant execute on function resumo_financeiro(uuid[], timestamptz, timestamptz) to anon, authenticated;

drop function if exists auditoria_resumo(uuid, timestamptz, timestamptz);
create or replace function auditoria_resumo(
  p_loja_ids uuid[] default null,
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
    where (p_loja_ids is null or loja_id = any(p_loja_ids))
      and (p_inicio is null or coalesce(data_pagamento, data_pedido) >= p_inicio)
      and (p_fim is null or coalesce(data_pagamento, data_pedido) < p_fim)
  )
  select json_build_object(
    'pedidos', (select count(*) from base),
    'divergentes', (select count(*) from base where abs(taxa_diferenca) > 0.50),
    'taxa_esperada_total', (select coalesce(sum(taxa_esperada), 0) from base),
    'taxa_real_total', (select coalesce(sum(taxa_real), 0) from base),
    'diferenca_total', (select coalesce(sum(taxa_diferenca), 0) from base),
    'cobrado_a_mais', (select coalesce(sum(taxa_diferenca) filter (where taxa_diferenca > 0), 0) from base),
    'cobrado_a_menos', (select coalesce(sum(taxa_diferenca) filter (where taxa_diferenca < 0), 0) from base)
  );
$$;
grant execute on function auditoria_resumo(uuid[], timestamptz, timestamptz) to anon, authenticated;
