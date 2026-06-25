-- Descrição do produto (get_item_base_info) para a IA responder dúvidas de
-- produto pela ficha real. Rode UMA vez no Supabase -> SQL Editor -> Run.

alter table produtos add column if not exists descricao text;
alter table produtos add column if not exists descricao_em timestamptz;
