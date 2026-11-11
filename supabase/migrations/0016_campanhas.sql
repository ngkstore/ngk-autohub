-- 11/11/2026 — Parte F (Calendário de campanhas). RLS em tudo.
set statement_timeout = '5min';

create table if not exists public.campanhas (
  id uuid primary key default gen_random_uuid(),
  canal text not null check (canal in ('shopee','tiktok','ambos')),
  loja_id uuid references public.lojas(id),
  nome text not null,
  tipo text not null default 'plataforma' check (tipo in ('plataforma','propria','afiliado','live')),
  subtipo text,                                -- desconto, oferta_relampago, cupom, combo, compre_junto, fixed_price, flashsale…
  inicio timestamptz,
  fim timestamptz,
  prazo_inscricao timestamptz,
  desconto_min numeric,                        -- exigência: desconto mínimo (%)
  estoque_min integer,                         -- exigência: estoque mínimo por item
  exigencias text,
  link text,
  observacao text,
  status text,                                 -- status na plataforma (promoções próprias)
  origem text not null default 'manual' check (origem in ('manual','api','captura')),
  plataforma_id text,                          -- id da promoção/atividade na plataforma
  bruto jsonb,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (canal, loja_id, plataforma_id)
);
create index if not exists campanhas_inicio_idx on public.campanhas (inicio, fim);
alter table public.campanhas enable row level security;

create table if not exists public.campanha_itens (
  id uuid primary key default gen_random_uuid(),
  campanha_id uuid not null references public.campanhas(id) on delete cascade,
  item_id text,
  model_id text,
  sku text,
  nome text,
  preco_normal numeric,
  preco_campanha numeric,
  estoque_promocao integer,
  status text,                                 -- aprovado/recusado (oferta relâmpago traz motivo)
  motivo_recusa text,
  margem numeric,                              -- R$ (último cálculo)
  margem_pct numeric,
  calculado_em timestamptz,
  bruto jsonb,
  unique (campanha_id, item_id, model_id)
);
alter table public.campanha_itens enable row level security;
