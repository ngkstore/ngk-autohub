-- ============================================================================
-- CHAT TIKTOK SHOP (30/09/2026)
-- 1) Adiciona coluna `marketplace` em chat_conversas (default 'shopee').
-- 2) Recria o PK como (marketplace, conversation_id) para não colidir IDs.
-- Idempotente.
-- ============================================================================

-- 1. Nova coluna (idempotente)
alter table chat_conversas
  add column if not exists marketplace text not null default 'shopee';

-- 2. Atualizar PK para incluir marketplace
--    (conversation_id era a PK sozinha; recriamos como composta)
do $$
begin
  -- remove PK antiga se ainda for só conversation_id
  if exists (
    select 1 from information_schema.table_constraints
    where table_name = 'chat_conversas'
      and constraint_type = 'PRIMARY KEY'
      and constraint_name = 'chat_conversas_pkey'
  ) then
    -- checa se já é composta
    if (
      select count(*) from information_schema.key_column_usage
      where table_name = 'chat_conversas'
        and constraint_name = 'chat_conversas_pkey'
    ) = 1 then
      alter table chat_conversas drop constraint chat_conversas_pkey;
      alter table chat_conversas add primary key (marketplace, conversation_id);
    end if;
  end if;
end $$;
