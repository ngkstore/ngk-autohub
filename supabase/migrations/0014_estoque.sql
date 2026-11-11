-- 11/11/2026 — Parte D (Catálogo unificado e Estoque). UpSeller é o dono do estoque:
-- o AutoHub só lê (nunca update_stock / inventory/update). Todas as tabelas com RLS.
set statement_timeout = '5min';

-- D1: estoque por armazém (coleta da API/MCP do UpSeller) + foto diária
create table if not exists public.estoque_armazem (
  armazem_id text not null,
  armazem_nome text,
  sku text not null,
  disponivel numeric not null default 0,
  ocupado numeric not null default 0,
  em_transito numeric not null default 0,
  atual numeric not null default 0,
  custo_medio numeric,
  bruto jsonb,
  coletado_em timestamptz not null default now(),
  primary key (armazem_id, sku)
);
create index if not exists estoque_armazem_sku_idx on public.estoque_armazem (sku);
alter table public.estoque_armazem enable row level security;

create table if not exists public.estoque_historico (
  dia date not null,
  armazem_id text not null,
  sku text not null,
  disponivel numeric not null default 0,
  atual numeric not null default 0,
  custo_medio numeric,
  primary key (dia, armazem_id, sku)
);
alter table public.estoque_historico enable row level security;

-- D2: catálogo unificado, mapeamento anúncio → SKU do armazém, kits
create table if not exists public.catalogo_sku (
  sku text primary key,
  nome text,
  tipo text not null default 'unico' check (tipo in ('unico','variacao','kit')),
  peso_kg numeric,
  medidas text,
  custo numeric,
  fornecedor_id uuid,
  caixa integer,                  -- unidades por caixa (arredonda a compra)
  ativo boolean not null default true,
  atualizado_em timestamptz not null default now()
);
alter table public.catalogo_sku enable row level security;

create table if not exists public.catalogo_mapeamento (
  id uuid primary key default gen_random_uuid(),
  canal text not null check (canal in ('shopee','tiktok')),
  loja_id uuid references public.lojas(id),
  item_id text,
  model_id text,
  sku_anuncio text not null,
  sku_armazem text not null,
  anormal boolean not null default false,
  observacao text,
  atualizado_em timestamptz not null default now(),
  unique (canal, loja_id, sku_anuncio)
);
create index if not exists catalogo_mapeamento_armazem_idx on public.catalogo_mapeamento (sku_armazem);
alter table public.catalogo_mapeamento enable row level security;

create table if not exists public.kit_componentes (
  sku_kit text not null,
  sku_componente text not null,
  quantidade numeric not null default 1,
  primary key (sku_kit, sku_componente)
);
alter table public.kit_componentes enable row level security;

-- D3: fator sazonal manual (mês e campanhas) — usado quando não há ano anterior
create table if not exists public.estoque_fator_sazonal (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  inicio date not null,
  fim date not null,
  fator numeric not null default 1,
  observacao text
);
alter table public.estoque_fator_sazonal enable row level security;

-- D4: fornecedores, exceções por SKU, compras a caminho
create table if not exists public.fornecedores (
  id uuid primary key default gen_random_uuid(),
  conta_id uuid,
  nome text not null,
  prazo_dias integer not null default 15,
  seguranca_dias integer not null default 5,
  caixa_padrao integer,
  observacao text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);
alter table public.fornecedores enable row level security;

create table if not exists public.fornecedor_sku_excecao (
  sku text primary key,
  fornecedor_id uuid references public.fornecedores(id) on delete set null,
  prazo_dias integer,
  seguranca_dias integer,
  caixa integer
);
alter table public.fornecedor_sku_excecao enable row level security;

create table if not exists public.compras_a_caminho (
  id uuid primary key default gen_random_uuid(),
  sku text not null,
  quantidade numeric not null,
  fornecedor_id uuid references public.fornecedores(id) on delete set null,
  previsao date,
  observacao text,
  recebido boolean not null default false,
  criado_em timestamptz not null default now()
);
create index if not exists compras_a_caminho_sku_idx on public.compras_a_caminho (sku) where not recebido;
alter table public.compras_a_caminho enable row level security;

-- Venda por SKU do armazém num período: pedido_itens → mapeamento → explode kits.
-- Sem mapeamento, assume que o SKU do anúncio é o SKU do armazém.
create or replace function public.vendas_por_sku_armazem(p_inicio date, p_fim date, p_loja_ids uuid[] default null)
returns table (sku_armazem text, qtd numeric, receita numeric)
language sql stable as $$
  with itens as (
    select i.loja_id, i.model_sku, i.qtd, coalesce(i.preco, 0) * i.qtd as receita, l.marketplace
    from public.pedido_itens i join public.lojas l on l.id = i.loja_id
    where i.dia >= p_inicio and i.dia < p_fim and i.model_sku is not null and i.model_sku <> ''
      and (p_loja_ids is null or i.loja_id = any(p_loja_ids))
  ),
  mapeados as (
    select coalesce(m.sku_armazem, it.model_sku) as sku, it.qtd, it.receita
    from itens it
    left join public.catalogo_mapeamento m
      on m.sku_anuncio = it.model_sku and m.loja_id = it.loja_id
  ),
  explodido as (
    select coalesce(k.sku_componente, mp.sku) as sku, mp.qtd * coalesce(k.quantidade, 1) as qtd,
           case when k.sku_componente is null then mp.receita else 0 end as receita
    from mapeados mp left join public.kit_componentes k on k.sku_kit = mp.sku
  )
  select sku, sum(qtd), sum(receita) from explodido group by sku;
$$;
revoke execute on function public.vendas_por_sku_armazem(date, date, uuid[]) from anon, authenticated;
