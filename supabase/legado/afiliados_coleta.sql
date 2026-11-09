-- Gestor de Afiliados (AMS) — Fase 1: coleta diária. Idempotente.
-- Métricas da Shopee (order_type=ConfirmedOrder, channel=AllChannel):
-- sales (R$), orders, items_sold, clicks, est_commission (R$), roi, buyers.

create table if not exists afiliados_loja_dia (
  loja_id uuid not null references lojas(id) on delete cascade,
  data date not null,
  vendas numeric not null default 0,
  pedidos integer not null default 0,
  itens integer not null default 0,
  cliques integer not null default 0,
  comissao numeric not null default 0,
  roi numeric,
  compradores integer not null default 0,
  novos_compradores integer not null default 0,
  coletado_em timestamptz not null default now(),
  primary key (loja_id, data)
);

create table if not exists afiliados_produto_dia (
  loja_id uuid not null references lojas(id) on delete cascade,
  data date not null,
  item_id bigint not null,
  item_name text,
  vendas numeric not null default 0,
  pedidos integer not null default 0,
  itens integer not null default 0,
  cliques integer not null default 0,
  comissao numeric not null default 0,
  roi numeric,
  compradores integer not null default 0,
  novos_compradores integer not null default 0,
  coletado_em timestamptz not null default now(),
  primary key (loja_id, data, item_id)
);
create index if not exists afiliados_produto_dia_item_idx on afiliados_produto_dia (loja_id, item_id, data desc);

create table if not exists afiliados_afiliado_dia (
  loja_id uuid not null references lojas(id) on delete cascade,
  data date not null,
  affiliate_id bigint not null,
  affiliate_name text,
  affiliate_username text,
  vendas numeric not null default 0,
  pedidos integer not null default 0,
  itens integer not null default 0,
  cliques integer not null default 0,
  comissao numeric not null default 0,
  roi numeric,
  compradores integer not null default 0,
  novos_compradores integer not null default 0,
  coletado_em timestamptz not null default now(),
  primary key (loja_id, data, affiliate_id)
);
create index if not exists afiliados_afiliado_dia_af_idx on afiliados_afiliado_dia (loja_id, affiliate_id, data desc);

-- Conteúdos (vídeos/lives): foto dos últimos 30 dias, atualizada todo dia.
create table if not exists afiliados_conteudo (
  loja_id uuid not null references lojas(id) on delete cascade,
  content_id text not null,
  titulo text,
  publicado_em timestamptz,
  affiliate_name text,
  affiliate_username text,
  canal text,
  produtos integer,
  views bigint not null default 0,
  likes integer not null default 0,
  comentarios integer not null default 0,
  vendas numeric not null default 0,
  pedidos integer not null default 0,
  itens integer not null default 0,
  janela_ini date,
  janela_fim date,
  coletado_em timestamptz not null default now(),
  primary key (loja_id, content_id)
);

-- Taxa de comissão configurada por item na campanha aberta (estado atual).
create table if not exists afiliados_item_taxa (
  loja_id uuid not null references lojas(id) on delete cascade,
  item_id bigint not null,
  item_name text,
  campaign_id bigint,
  campaign_status text,
  taxa numeric,
  taxa_max_dia numeric,
  periodo_ini timestamptz,
  periodo_fim timestamptz,
  coletado_em timestamptz not null default now(),
  primary key (loja_id, item_id)
);

-- Histórico da taxa (pra cruzar mudança de taxa x resultado depois).
create table if not exists afiliados_item_taxa_hist (
  loja_id uuid not null references lojas(id) on delete cascade,
  item_id bigint not null,
  data date not null,
  taxa numeric,
  primary key (loja_id, item_id, data)
);
