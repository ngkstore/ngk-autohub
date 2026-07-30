-- Medição de consumo de IA por CONTA (para cobrar cada cliente pelo custo real).
-- Cada resposta do robô (chat = Opus, avaliação = Haiku) grava uma linha aqui,
-- com os tokens e o custo em USD já calculado no app (lib/uso.ts).
-- A tela /uso soma isso por conta no período. Rode UMA vez no Supabase ->
-- SQL Editor -> Run (seguro rodar de novo).

create table if not exists uso_ia (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz default now(),
  loja_id uuid references lojas(id),
  marketplace text,
  tipo text,                              -- 'chat' | 'avaliacao'
  modelo text,                            -- ex.: claude-opus-4-8
  tokens_entrada integer default 0,
  tokens_saida integer default 0,
  tokens_cache_leitura integer default 0,
  tokens_cache_escrita integer default 0,
  custo_usd numeric(12,6) default 0
);

create index if not exists uso_ia_loja_idx on uso_ia (loja_id);
create index if not exists uso_ia_criado_idx on uso_ia (criado_em);

-- Resumo por conta no período: nº de chamadas, tokens e custo em USD.
--   p_loja_ids null  = todas as lojas (admin)
--   p_loja_ids {..}  = só as lojas informadas
drop function if exists resumo_uso_ia(uuid[], timestamptz, timestamptz);
create or replace function resumo_uso_ia(
  p_loja_ids uuid[] default null,
  p_inicio timestamptz default null,
  p_fim timestamptz default null
)
returns json
language sql
stable
as $$
  with base as (
    select u.*, l.conta_id
    from uso_ia u
    left join lojas l on l.id = u.loja_id
    where (p_loja_ids is null or u.loja_id = any(p_loja_ids))
      and (p_inicio is null or u.criado_em >= p_inicio)
      and (p_fim is null or u.criado_em < p_fim)
  )
  select coalesce(json_agg(t order by t.custo_usd desc), '[]'::json)
  from (
    select coalesce(c.nome, 'Sem conta') as conta_nome,
           b.conta_id,
           count(*)::int as chamadas,
           count(*) filter (where b.tipo = 'chat')::int as chamadas_chat,
           count(*) filter (where b.tipo = 'avaliacao')::int as chamadas_avaliacao,
           coalesce(sum(b.tokens_entrada), 0)::bigint as tokens_entrada,
           coalesce(sum(b.tokens_saida), 0)::bigint as tokens_saida,
           coalesce(sum(b.custo_usd), 0) as custo_usd
    from base b
    left join contas c on c.id = b.conta_id
    group by b.conta_id, c.nome
  ) t;
$$;
grant execute on function resumo_uso_ia(uuid[], timestamptz, timestamptz) to anon, authenticated;
