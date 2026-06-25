-- Tabelas do chat da Shopee (sellerchat). IDs são enormes -> guardar como texto.
-- Rode UMA vez no Supabase -> SQL Editor -> Run (seguro rodar de novo).

create table if not exists chat_conversas (
  conversation_id text primary key,
  to_id text,
  to_name text,
  item_id bigint,
  ultimo_remetente text,        -- 'cliente' | 'loja'
  precisa_resposta boolean default false,
  unread_count int default 0,
  ultima_mensagem text,
  ultima_mensagem_ts bigint,    -- timestamp em nanossegundos da Shopee
  atualizado_em timestamptz default now()
);

create index if not exists idx_chat_conversas_pendentes
  on chat_conversas (precisa_resposta, ultima_mensagem_ts);

create table if not exists chat_mensagens (
  message_id text primary key,
  conversation_id text,
  de_loja boolean default false,   -- true = mensagem enviada pela loja
  texto text,
  item_id bigint,
  created_timestamp bigint,        -- em segundos
  criado_em timestamptz default now()
);

create index if not exists idx_chat_mensagens_conversa
  on chat_mensagens (conversation_id);

create index if not exists idx_chat_mensagens_item
  on chat_mensagens (item_id, de_loja);
