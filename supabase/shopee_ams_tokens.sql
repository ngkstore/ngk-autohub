-- Token do SEGUNDO app da Shopee (só módulo de Afiliados / AMS), separado de
-- marketplace_tokens de propósito: várias rotinas buscam o token da loja por
-- loja_id sem filtrar marketplace, e o callback apaga os tokens da loja ao
-- reconectar — um 2º registro lá quebraria o app principal.
create table if not exists shopee_ams_tokens (
  loja_id uuid primary key references lojas(id) on delete cascade,
  shop_id text not null,
  access_token text not null,
  refresh_token text not null,
  expira_em timestamptz not null,
  status text not null default 'ativo',
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
