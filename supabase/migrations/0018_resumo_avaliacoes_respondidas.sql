-- Visão geral: "% das avaliações respondidas" e "Taxa de automação" vinham de respostas_ia
-- (3 linhas de teste) e davam 0 %. O robô grava em avaliacoes (status='respondida',
-- ja_respondida, respondida_em = respondida pelo robô). O resumo passa a devolver os dois contadores.
create or replace function public.resumo_avaliacoes(
  p_loja_ids uuid[] default null,
  p_inicio timestamptz default null,
  p_fim timestamptz default null
) returns json
language sql
stable
as $function$
  with base as (
    select avaliacao, status, ja_respondida, respondida_em from avaliacoes
    where (p_loja_ids is null or loja_id = any(p_loja_ids))
      and (p_inicio is null or criado_em >= p_inicio)
      and (p_fim is null or criado_em < p_fim)
  )
  select json_build_object(
    'total', count(*),
    'media', coalesce(round(avg(avaliacao)::numeric,1),0),
    'n1', count(*) filter (where avaliacao=1), 'n2', count(*) filter (where avaliacao=2),
    'n3', count(*) filter (where avaliacao=3), 'n4', count(*) filter (where avaliacao=4),
    'n5', count(*) filter (where avaliacao=5),
    'respondidas', count(*) filter (where status = 'respondida' or coalesce(ja_respondida, false)),
    'pelo_robo', count(*) filter (where respondida_em is not null)
  ) from base;
$function$;
