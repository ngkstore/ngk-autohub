-- ============================================================================
-- ADS (nível loja/dia) — base do "Raio-X do Anúncio" Fase 1.
-- Guarda a performance diária de anúncios (get_all_cpc_ads_daily_performance):
-- gasto, GMV (direto/broad), pedidos, cliques, ROAS. `bruto` mantém a linha
-- crua da API (rede de segurança caso um campo mude de nome).
-- Rode no Supabase -> SQL Editor -> Run (seguro rodar de novo).
-- ============================================================================
create table if not exists ads_diario (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid references lojas(id),
  dia date not null,
  impressoes bigint,
  cliques bigint,
  ctr numeric,
  gasto numeric(14,2),
  pedidos_direto bigint,
  pedidos_broad bigint,
  gmv_direto numeric(14,2),
  gmv_broad numeric(14,2),
  roas_direto numeric,
  roas_broad numeric,
  bruto jsonb,
  atualizado_em timestamptz default now(),
  unique (loja_id, dia)
);
create index if not exists ads_diario_loja_dia_idx on ads_diario (loja_id, dia);
