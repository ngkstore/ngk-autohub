-- Colunas para sincronizar as avaliações reais da Shopee (get_comment).
-- Rode UMA vez no Supabase -> SQL Editor -> Run (seguro rodar de novo).

alter table avaliacoes add column if not exists comment_id bigint;
alter table avaliacoes add column if not exists item_id bigint;
alter table avaliacoes add column if not exists order_sn text;
alter table avaliacoes add column if not exists data_avaliacao timestamptz;
alter table avaliacoes add column if not exists ja_respondida boolean default false;
alter table avaliacoes add column if not exists resposta_shopee text;

-- comment_id único (permite múltiplos NULL nas linhas antigas/fake) para o upsert.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'avaliacoes_comment_id_unique'
  ) then
    alter table avaliacoes add constraint avaliacoes_comment_id_unique unique (comment_id);
  end if;
end$$;

create index if not exists idx_avaliacoes_pendentes
  on avaliacoes (marketplace, ja_respondida, avaliacao);
