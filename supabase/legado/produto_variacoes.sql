-- Variações (models) de cada produto, vindas da API da Shopee (get_model_list).
-- Antes o sistema só conhecia as variações pelos pedidos: variação que nunca vendeu
-- não aparecia no /financas pra cadastrar custo. Idempotente. 14/set/2026.
create table if not exists produto_variacoes (
  loja_id       uuid not null,
  item_id       text not null,
  model_id      bigint not null,
  model_sku     text,
  nome          text,            -- "Azul / M" (tier_variation + option_list via tier_index)
  preco         numeric(12,2),   -- current_price
  estoque       int,
  status        text,            -- MODEL_NORMAL | MODEL_UNAVAILABLE
  atualizado_em timestamptz default now(),
  primary key (loja_id, item_id, model_id)
);
create index if not exists produto_variacoes_item_idx on produto_variacoes (loja_id, item_id);
grant select, insert, update, delete on produto_variacoes to anon, authenticated;

-- Quando a lista de variações do produto foi sincronizada por último (o cron pega
-- os mais antigos primeiro).
alter table produtos add column if not exists variacoes_em timestamptz;
