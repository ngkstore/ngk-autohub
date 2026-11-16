-- Módulo Creators (TikTok) — fase 1: leitura + fila de decisão (T-002, 16/11/2026). Nada grava no TikTok.
-- Dados pessoais do criador: só id, usuário, métricas públicas e demografia agregada.

create table if not exists public.tiktok_amostras (
  loja_id uuid not null references public.lojas(id),
  amostra_id text not null,
  criador_id text,
  criador_usuario text,
  criador_nome text,
  produto_id text,
  produto_nome text,
  sku_id text,
  sku_nome text,
  status text,                       -- PENDING, APPROVED, REJECTED, EXPIRED, ... (como a API manda)
  is_approvable boolean default false,
  pedido_em timestamptz,
  expira_em timestamptz,
  order_id text,                     -- pedido da amostra (0 = ainda não gerado)
  taxa_comissao numeric,
  custo_amostra numeric,             -- custo do SKU no UpSeller + frete estimado
  nota integer,
  nota_motivos jsonb,
  sugestao text,                     -- aprovar | recusar | decidir
  decisao text,                      -- decisão humana registrada (fase 1: só registro)
  decidido_por text,
  decidido_em timestamptz,
  bruto jsonb,
  coletado_em timestamptz default now(),
  atualizado_em timestamptz default now(),
  primary key (loja_id, amostra_id)
);
alter table public.tiktok_amostras enable row level security;
create index if not exists tiktok_amostras_expira_idx on public.tiktok_amostras (loja_id, status, expira_em);

create table if not exists public.tiktok_amostra_envios (
  loja_id uuid not null,
  amostra_id text not null,
  fulfillment_id text not null,
  status text,
  rastreio text,
  enviado_em timestamptz,
  conteudo_publicado boolean default false,
  conteudo_tipo text,
  conteudo_id text,
  bruto jsonb,
  checado_em timestamptz default now(),
  primary key (loja_id, amostra_id, fulfillment_id)
);
alter table public.tiktok_amostra_envios enable row level security;

alter table public.tiktok_criadores add column if not exists nivel integer;
alter table public.tiktok_criadores add column if not exists taxa_cumprimento numeric;
alter table public.tiktok_criadores add column if not exists categorias jsonb;
alter table public.tiktok_criadores add column if not exists media_views_video numeric;
alter table public.tiktok_criadores add column if not exists media_views_live numeric;
alter table public.tiktok_criadores add column if not exists demografia jsonb;
alter table public.tiktok_criadores add column if not exists gmv_moeda text;
alter table public.tiktok_criadores add column if not exists perfil_em timestamptz;
alter table public.tiktok_criadores add column if not exists ultimo_erro text;

-- produtos do TikTok (nome e categoria), preenchido pelo coletor de estoque (products/search)
create table if not exists public.tiktok_produtos (
  loja_id uuid not null,
  produto_id text not null,
  nome text,
  categoria_id text,
  categoria_nome text,
  status text,
  atualizado_em timestamptz default now(),
  primary key (loja_id, produto_id)
);
alter table public.tiktok_produtos enable row level security;

create table if not exists public.tiktok_produtos_parados (
  loja_id uuid not null,
  produto_id text not null,
  nome text,
  categoria_id text,
  sku_armazem text,
  estoque integer,
  vendas_28d integer,
  pedidos_28d integer,
  views_28d integer,
  parado boolean default false,
  amostras_pendentes integer default 0,
  calculado_em timestamptz default now(),
  primary key (loja_id, produto_id)
);
alter table public.tiktok_produtos_parados enable row level security;

-- parâmetros por conta (limites, pesos e regras — tudo configurável)
create table if not exists public.creators_config (
  conta_id uuid primary key,
  parado_estoque_min integer default 300,
  parado_pct numeric default 2,          -- vendas 28 d < 2 % do estoque
  peso_nivel_gmv integer default 35,
  peso_cumprimento integer default 20,
  peso_categoria integer default 15,
  peso_ja_vendeu integer default 15,
  peso_views integer default 15,
  bonus_parado integer default 10,
  aprovar_nota integer default 70,
  aprovar_nota_custo integer default 50,  -- nota >= 50 aprova se custo <= aprovar_custo_max
  aprovar_custo_max numeric default 40,
  recusar_nota integer default 30,
  recusar_custo_min numeric default 40,
  frete_amostra numeric default 12,
  atualizado_em timestamptz default now()
);
alter table public.creators_config enable row level security;

-- backoff da API (36009002): quando a API limita, o coletor espera até `ate` antes de insistir
create table if not exists public.tiktok_api_backoff (
  chave text primary key,
  ate timestamptz not null,
  motivo text,
  atualizado_em timestamptz default now()
);
alter table public.tiktok_api_backoff enable row level security;

-- fase 2 (desligada): registro de quem aprovou cada ação antes de qualquer chamada de escrita
create table if not exists public.creators_acoes_log (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid,
  acao text,
  params jsonb,
  aprovado_por text,
  status text,
  criado_em timestamptz default now()
);
alter table public.creators_acoes_log enable row level security;
