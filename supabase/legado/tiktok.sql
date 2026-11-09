-- TikTok Shop: as chamadas de API precisam do shop_cipher além do shop_id.
-- Guarda na mesma tabela marketplace_tokens (marketplace = 'tiktok_shop').
-- Rode UMA vez no Supabase -> SQL Editor -> Run.

alter table public.marketplace_tokens
  add column if not exists shop_cipher text;
