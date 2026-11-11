-- 11/11/2026 — Parte E (Lives e afiliados). Todas com RLS.
set statement_timeout = '5min';

create table if not exists public.lives (
  id uuid primary key default gen_random_uuid(),
  canal text not null check (canal in ('shopee','tiktok')),
  loja_id uuid references public.lojas(id),
  live_id text,                               -- id da plataforma (TikTok); null em lançamento manual
  origem text not null default 'api' check (origem in ('api','manual','captura')),
  tipo_conta text,                            -- OFFICIAL_ACCOUNTS | AFFILIATE_ACCOUNTS
  criador_nome text,
  criador_usuario text,
  criador_id text,
  inicio timestamptz,
  fim timestamptz,
  duracao_s integer,
  receita numeric default 0,                  -- GMV atribuído à live
  pedidos integer default 0,
  itens integer default 0,
  espectadores integer,
  pico integer,
  tempo_medio_s numeric,
  ctr numeric,                                -- clique no produto
  likes integer,
  comentarios integer,
  compartilhamentos integer,
  novos_seguidores integer,
  receita_por_hora numeric,
  observacao text,
  bruto jsonb,
  coletado_em timestamptz not null default now(),
  unique (canal, live_id)
);
create index if not exists lives_loja_inicio_idx on public.lives (loja_id, inicio desc);
alter table public.lives enable row level security;

create table if not exists public.live_produtos (
  live_uuid uuid not null references public.lives(id) on delete cascade,
  produto_id text not null,
  sku text,
  nome text,
  receita numeric default 0,
  pedidos integer default 0,
  itens integer default 0,
  cliques integer,
  impressoes integer,
  bruto jsonb,
  primary key (live_uuid, produto_id)
);
alter table public.live_produtos enable row level security;

create table if not exists public.videos_desempenho (
  canal text not null default 'tiktok',
  loja_id uuid references public.lojas(id),
  video_id text not null,
  criador_nome text,
  criador_usuario text,
  criador_tipo text,                          -- AFFILIATE_ACCOUNTS | OFFICIAL...
  publicado_em timestamptz,
  duracao_s integer,
  views integer,
  likes integer,
  comentarios integer,
  compartilhamentos integer,
  gmv numeric default 0,
  gmv_atribuido numeric default 0,
  gmv_indireto numeric default 0,
  pedidos integer,
  itens integer,
  ctr numeric,
  gpm numeric,
  janela_ini date,
  janela_fim date,
  bruto jsonb,
  coletado_em timestamptz not null default now(),
  primary key (canal, video_id)
);
create index if not exists videos_desempenho_loja_idx on public.videos_desempenho (loja_id, gmv_atribuido desc);
alter table public.videos_desempenho enable row level security;

create table if not exists public.produtos_canal_dia (
  loja_id uuid not null references public.lojas(id),
  janela_ini date not null,
  janela_fim date not null,
  produto_id text not null,
  nome text,
  gmv_vendedor numeric default 0,
  gmv_afiliado numeric default 0,
  gmv_vitrine numeric default 0,
  gmv_live_afiliado numeric default 0,
  gmv_video_afiliado numeric default 0,
  pedidos_afiliado integer,
  bruto jsonb,
  coletado_em timestamptz not null default now(),
  primary key (loja_id, janela_ini, janela_fim, produto_id)
);
alter table public.produtos_canal_dia enable row level security;

create table if not exists public.tiktok_afiliado_pedidos (
  loja_id uuid not null references public.lojas(id),
  order_id text not null,
  sku_id text not null,
  criador_usuario text,
  criador_id text,
  conteudo_tipo text,                         -- VIDEO | LIVE | SHOWCASE
  conteudo_id text,
  modelo_comissao text,
  taxa_comissao numeric,                      -- em %
  comissao_estimada numeric,
  comissao_paga numeric,
  base_comissao numeric,
  status_liquidacao text,
  campanha_id text,
  criado_em timestamptz,
  entregue_em timestamptz,
  bruto jsonb,
  coletado_em timestamptz not null default now(),
  primary key (loja_id, order_id, sku_id)
);
create index if not exists tiktok_afiliado_pedidos_criador_idx on public.tiktok_afiliado_pedidos (loja_id, criador_usuario);
alter table public.tiktok_afiliado_pedidos enable row level security;

create table if not exists public.tiktok_criadores (
  criador_id text primary key,
  usuario text,
  nome text,
  seguidores integer,
  gmv numeric,
  gmv_video numeric,
  gmv_live numeric,
  bruto jsonb,
  coletado_em timestamptz not null default now()
);
alter table public.tiktok_criadores enable row level security;

-- Conversões de afiliados Shopee (AMS get_conversion_report), por pedido e item.
create table if not exists public.afiliados_conversao (
  loja_id uuid not null references public.lojas(id),
  order_sn text not null,
  item_id text not null default '',
  affiliate_id text,
  affiliate_username text,
  canal text,
  comissao numeric,
  valor_pedido numeric,
  reembolsado boolean default false,
  status text,
  comprado_em timestamptz,
  bruto jsonb,
  coletado_em timestamptz not null default now(),
  primary key (loja_id, order_sn, item_id)
);
alter table public.afiliados_conversao enable row level security;

-- SPS do TikTok (sem API no Brasil): lançamento manual semanal ou captura da extensão.
create table if not exists public.sps_lancamentos (
  loja_id uuid not null references public.lojas(id),
  dia date not null,
  sps numeric not null,
  origem text not null default 'manual' check (origem in ('manual','captura')),
  observacao text,
  criado_em timestamptz not null default now(),
  primary key (loja_id, dia)
);
alter table public.sps_lancamentos enable row level security;
