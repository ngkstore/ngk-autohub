-- Creators (R-002): frete estimado da amostra por faixa de peso do SKU (configurável) e peso do produto do TikTok.
alter table public.creators_config add column if not exists frete_ate_1kg numeric default 12;
alter table public.creators_config add column if not exists frete_1_a_5kg numeric default 25;
alter table public.creators_config add column if not exists frete_5_a_15kg numeric default 45;
alter table public.creators_config add column if not exists frete_acima_15kg numeric default 80;
alter table public.creators_config add column if not exists frete_sem_peso numeric default 25;
alter table public.tiktok_produtos add column if not exists peso_kg numeric;
alter table public.tiktok_amostras add column if not exists peso_kg numeric;
