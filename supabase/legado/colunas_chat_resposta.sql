-- Controle das respostas do chat (IA). Rode UMA vez no Supabase -> SQL Editor.

alter table chat_conversas add column if not exists latest_message_id text;
alter table chat_conversas add column if not exists ultimo_tratado_msg_id text; -- última msg do cliente já tratada
alter table chat_conversas add column if not exists categoria text;            -- produto/prazo/logistica/defeito/outro
alter table chat_conversas add column if not exists confianca text;            -- alta/baixa
alter table chat_conversas add column if not exists resposta_ia text;          -- resposta enviada/proposta
alter table chat_conversas add column if not exists respondida_em timestamptz; -- quando a IA respondeu
alter table chat_conversas add column if not exists escalada boolean default false; -- precisa de humano
alter table chat_conversas add column if not exists motivo_escala text;
