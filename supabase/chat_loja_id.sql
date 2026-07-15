-- Multi-loja no chat: as tabelas de chat não tinham loja_id.
-- Rode no SQL Editor do Supabase (uma vez; seguro repetir).

alter table public.chat_conversas add column if not exists loja_id uuid;
alter table public.chat_mensagens add column if not exists loja_id uuid;

-- Backfill: tudo que já existe hoje é da loja NGK Shopee.
update public.chat_conversas
  set loja_id = '329df5fb-0d8f-4eb5-af36-ff216152cedf'
  where loja_id is null;

update public.chat_mensagens
  set loja_id = '329df5fb-0d8f-4eb5-af36-ff216152cedf'
  where loja_id is null;

create index if not exists idx_chat_conversas_loja
  on public.chat_conversas (loja_id, precisa_resposta);

create index if not exists idx_chat_mensagens_loja
  on public.chat_mensagens (loja_id, item_id);
