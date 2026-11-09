-- ============================================================================
-- PERFORMANCE do Dashboard/Financeiro — evita timeout do role anon (~3s).
-- Rode no Supabase -> SQL Editor -> Run (seguro rodar de novo).
-- ============================================================================

-- Índice de cobertura: resumo_pedidos agrega SEM ler o heap (que tem o
-- dados_pedido gordo por linha). Vira index-only scan -> ~1-2s em vez de 13s.
create index if not exists pedidos_resumo_cov on pedidos (loja_id)
  include (valor_total, pedido_efetivado, entra_faturamento, status, marketplace, data_pagamento, data_pedido);

-- Filtro por loja (escopo por conta) usa índice em vez de seq scan.
create index if not exists pedidos_loja_idx on pedidos (loja_id);

-- Índice de cobertura p/ resumo_avaliacoes (nota média/distribuição) — evita
-- puxar 69k linhas de avaliacoes pra memória da função (causava lentidão/502).
create index if not exists avaliacoes_resumo_cov on avaliacoes (loja_id)
  include (avaliacao, criado_em);

-- O timeout padrão do anon (3s) é curto demais p/ o dashboard, mas 20s deixava
-- queries lentas segurando conexão e saturavam o pool (502 em cascata). 8s é o
-- equilíbrio: cabe as agregações (resumo_pedidos escopado ~1.8s) e solta rápido.
alter role anon set statement_timeout = '8s';
alter role authenticated set statement_timeout = '8s';
-- (recarrega o PostgREST p/ pegar a config nova)
notify pgrst, 'reload config';

-- Normaliza o status das lojas ("ativa" -> "ativo") p/ o contador "Lojas Ativas".
update lojas set status = 'ativo' where status = 'ativa';

-- Resumo de avaliações (nota média + distribuição) agregado no banco, em vez de
-- o dashboard puxar todas as linhas (que ainda vinha CAPADO em 1000 -> nota errada).
create or replace function resumo_avaliacoes(p_loja_ids uuid[] default null, p_inicio timestamptz default null, p_fim timestamptz default null)
returns json language sql stable as $$
  with base as (
    select avaliacao from avaliacoes
    where (p_loja_ids is null or loja_id = any(p_loja_ids))
      and (p_inicio is null or criado_em >= p_inicio)
      and (p_fim is null or criado_em < p_fim)
  )
  select json_build_object(
    'total', count(*), 'media', coalesce(round(avg(avaliacao)::numeric,1),0),
    'n1', count(*) filter (where avaliacao=1), 'n2', count(*) filter (where avaliacao=2),
    'n3', count(*) filter (where avaliacao=3), 'n4', count(*) filter (where avaliacao=4),
    'n5', count(*) filter (where avaliacao=5)
  ) from base;
$$;
grant execute on function resumo_avaliacoes(uuid[], timestamptz, timestamptz) to anon, authenticated;
