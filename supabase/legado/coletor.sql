-- Coletor: recebe as respostas cruas da API interna do Seller Center
-- (/api/pas/ = Shopee Ads, /api/mydata/ = Informações Gerenciais) capturadas
-- pela extensão enquanto você navega no painel.
-- Guarda CRU primeiro (igual fizemos com as planilhas): a gente vê o que vem
-- e só depois modela. Rode UMA vez no Supabase -> SQL Editor -> Run.

create table if not exists coletor_capturas (
  id uuid primary key default gen_random_uuid(),
  conta_id uuid,
  loja_id uuid,
  shop_id text,
  url text,
  metodo text,
  payload jsonb,
  capturado_em timestamptz default now()
);

create index if not exists idx_coletor_conta
  on coletor_capturas (conta_id, capturado_em desc);

create index if not exists idx_coletor_url
  on coletor_capturas (url, capturado_em desc);
