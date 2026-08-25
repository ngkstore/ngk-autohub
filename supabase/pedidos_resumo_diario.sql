-- ============================================================================
-- RESUMO DIÁRIO DE PEDIDOS — tabela pré-agregada que o dashboard/pedidos leem.
-- Motivo: pedidos tem ~84k linhas com dados_pedido (jsonb GORDO); agregar direto
-- lê o heap inteiro (6-13s) e estourava o timeout de 8s do anon -> dashboard
-- zerava intermitentemente. Esta tabela é minúscula (~850 linhas) e a RPC
-- resumo_pedidos passa a ler dela: <1s sempre, sem cold-start nem timeout.
-- Recriada por cron (/api/shopee/pedidos/resumo-diario, a cada 10 min).
-- Rode no Supabase -> SQL Editor -> Run (seguro rodar de novo).
-- ============================================================================

create table if not exists pedidos_resumo_diario (
  loja_id uuid,
  dia date,
  status text,
  efetivado boolean,
  faturado boolean,
  qtd int,
  valor numeric(14,2)
);
create index if not exists prd_loja_dia_idx on pedidos_resumo_diario (loja_id, dia);

-- Reconstrói o resumo a partir dos pedidos (janela por dia BRT). SET LOCAL sobe
-- o timeout só desta execução (a varredura da tabela gorda passa dos 8s).
create or replace function rebuild_pedidos_resumo_diario()
returns void language plpgsql as $$
begin
  set local statement_timeout = '120s';
  delete from pedidos_resumo_diario;
  insert into pedidos_resumo_diario (loja_id, dia, status, efetivado, faturado, qtd, valor)
  select loja_id,
    (coalesce(data_pagamento, data_pedido) at time zone 'America/Sao_Paulo')::date as dia,
    coalesce(status, 'UNKNOWN') as status,
    coalesce(pedido_efetivado, false) as efetivado,
    coalesce(entra_faturamento, false) as faturado,
    count(*)::int as qtd,
    coalesce(sum(valor_total), 0) as valor
  from pedidos
  where marketplace = 'shopee' and coalesce(data_pagamento, data_pedido) is not null
  group by 1, 2, 3, 4, 5;
end $$;
grant execute on function rebuild_pedidos_resumo_diario() to anon, authenticated;

-- resumo_pedidos AGORA lê da tabela-resumo (instantâneo). 'por_marketplace'
-- agrupa por loja (apelido); 'vendas_por_dia' por dia BRT.
create or replace function resumo_pedidos(p_loja_ids uuid[] default null, p_inicio timestamptz default null, p_fim timestamptz default null)
returns json language sql stable as $$
  with base as (
    select d.loja_id, d.dia, d.status, d.efetivado, d.faturado, d.qtd, d.valor
    from pedidos_resumo_diario d
    where (p_loja_ids is null or d.loja_id = any(p_loja_ids))
      and (p_inicio is null or d.dia >= (p_inicio at time zone 'America/Sao_Paulo')::date)
      and (p_fim is null or d.dia < (p_fim at time zone 'America/Sao_Paulo')::date)
  ),
  tot as (select
    coalesce(sum(qtd),0) as total_pedidos,
    coalesce(sum(qtd) filter (where efetivado),0) as pedidos_efetivados,
    coalesce(sum(qtd) filter (where faturado),0) as pedidos_faturados,
    coalesce(sum(qtd) filter (where not efetivado and status<>'UNPAID'),0) as pedidos_cancelados,
    coalesce(sum(valor),0) as faturamento_geral,
    coalesce(sum(valor) filter (where efetivado),0) as faturamento_efetivado,
    coalesce(sum(valor) filter (where faturado),0) as faturamento_concluido
    from base),
  st as (select coalesce(json_agg(json_build_object('status',status,'quantidade',q) order by q desc),'[]'::json) j
    from (select status, sum(qtd)::int as q from base group by status) x),
  mk as (select coalesce(json_agg(json_build_object('marketplace',loja,'faturamento',fat) order by fat desc),'[]'::json) j
    from (select coalesce(l.apelido,'sem loja') as loja, coalesce(sum(b.valor) filter (where b.efetivado),0) as fat
          from base b left join lojas l on l.id=b.loja_id group by 1) x),
  vd as (select coalesce(json_agg(json_build_object('dia',to_char(dia,'YYYY-MM-DD'),'faturamento',fat) order by dia),'[]'::json) j
    from (select dia, coalesce(sum(valor) filter (where efetivado),0) as fat from base group by dia) x)
  select json_build_object(
    'total_pedidos',tot.total_pedidos,'pedidos_efetivados',tot.pedidos_efetivados,
    'pedidos_faturados',tot.pedidos_faturados,'pedidos_cancelados',tot.pedidos_cancelados,
    'faturamento_geral',tot.faturamento_geral,'faturamento_efetivado',tot.faturamento_efetivado,
    'faturamento_concluido',tot.faturamento_concluido,
    'por_status',st.j,'por_marketplace',mk.j,'vendas_por_dia',vd.j
  ) from tot,st,mk,vd;
$$;
grant execute on function resumo_pedidos(uuid[], timestamptz, timestamptz) to anon, authenticated;

select rebuild_pedidos_resumo_diario();
