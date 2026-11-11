-- 11/11/2026 — o upsert de eventos usava "on conflict (devolucao_id, chave)", mas o índice único
-- era parcial (where chave is not null) e o Postgres não o aceita como alvo do ON CONFLICT.
-- Chave passa a ser obrigatória (vazia quando não houver) e o índice único vira total.
drop index if exists public.devolucao_eventos_chave_idx;
update public.devolucao_eventos set chave = '' where chave is null;
alter table public.devolucao_eventos alter column chave set default '';
alter table public.devolucao_eventos alter column chave set not null;
create unique index if not exists devolucao_eventos_chave_idx on public.devolucao_eventos (devolucao_id, chave);
