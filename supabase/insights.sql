-- Importação de planilhas do Business Insights (Seller Center).
-- Guarda de forma FLEXÍVEL (linhas em jsonb) para primeiro entendermos quais
-- dados o export realmente traz, antes de modelar colunas fixas.
-- Rode UMA vez no Supabase -> SQL Editor -> Run.

create table if not exists insights_importacoes (
  id uuid primary key default gen_random_uuid(),
  conta_id uuid,
  loja_id uuid,
  arquivo text,
  colunas text[],              -- nomes das colunas detectadas
  total_linhas int,
  linhas jsonb,                -- todas as linhas (array de objetos)
  importado_em timestamptz default now()
);

create index if not exists idx_insights_import_conta
  on insights_importacoes (conta_id, importado_em desc);
