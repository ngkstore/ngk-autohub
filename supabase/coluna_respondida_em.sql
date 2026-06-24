-- Marca quando o robô respondeu cada avaliação, para medir o ritmo.
-- Rode UMA vez no Supabase -> SQL Editor -> Run (seguro rodar de novo).

alter table avaliacoes add column if not exists respondida_em timestamptz;

create index if not exists idx_avaliacoes_respondida_em
  on avaliacoes (respondida_em);
