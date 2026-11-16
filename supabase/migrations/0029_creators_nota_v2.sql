-- Creators (T-003): escala nível/GMV, categoria por grupos, aprovação para produto parado, categoria e peso
-- do produto pelo detalhe (products/{id}), árvore de categorias do TikTok.
alter table public.creators_config add column if not exists escala_nivel_gmv jsonb
  default '[{"nivel":7,"gmv":500000,"pontos":35},{"nivel":6,"gmv":200000,"pontos":31},{"nivel":5,"gmv":100000,"pontos":27},{"nivel":4,"gmv":40000,"pontos":22},{"nivel":3,"gmv":15000,"pontos":16},{"nivel":2,"gmv":5000,"pontos":10},{"nivel":99,"gmv":1000,"pontos":5}]'::jsonb;
alter table public.creators_config add column if not exists cat_igual integer default 15;
alter table public.creators_config add column if not exists cat_vizinha integer default 8;
alter table public.creators_config add column if not exists cat_outra integer default 3;
alter table public.creators_config add column if not exists cat_desconhecida integer default 5;
alter table public.creators_config add column if not exists aprovar_parado_nota integer default 60;
alter table public.creators_config add column if not exists aprovar_parado_custo_max numeric default 600;
alter table public.creators_config add column if not exists usd_brl numeric default 5.4;

alter table public.tiktok_produtos add column if not exists categoria_nivel1_id text;
alter table public.tiktok_produtos add column if not exists categoria_nivel1_nome text;
alter table public.tiktok_produtos add column if not exists categoria_cadeia jsonb;
alter table public.tiktok_produtos add column if not exists detalhe_em timestamptz;

alter table public.tiktok_criadores add column if not exists gmv_brl numeric;   -- GMV em BRL (vem no sample_applications/search)
alter table public.tiktok_criadores add column if not exists gmv_usd numeric;   -- GMV do perfil (marketplace_creators, em USD)

-- árvore de categorias do TikTok (id → pai → primeiro nível), preenchida pelas cadeias dos produtos e pela API de categorias
create table if not exists public.tiktok_categorias (
  id text primary key,
  parent_id text,
  nome text,
  nivel1_id text,
  nivel1_nome text,
  atualizado_em timestamptz default now()
);
alter table public.tiktok_categorias enable row level security;
