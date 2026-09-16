-- Saúde da conta (Account Health da Shopee). Snapshot diário por loja das métricas
-- de desempenho (envio / anúncios / atendimento) + histórico de pontos de penalidade
-- e punições + pedidos atrasados + anúncios com problema + registro de alertas enviados.
-- Idempotente. Coletor: lib/shopee/saudeConta.ts, cron GET /api/shopee/saude/coletar.
create table if not exists saude_conta_snapshot (
  id bigserial primary key,
  loja_id uuid not null,
  dia date not null,
  rating int,                    -- 1 Ruim, 2 Precisa melhorar, 3 Bom, 4 Excelente
  falhas_envio int,              -- fulfillment_failed
  falhas_anuncio int,            -- soma de listing_failed
  falhas_atendimento int,        -- custom_service_failed
  metricas_fora int,             -- métricas fora da meta (calculado pelo coletor)
  pedidos_atrasados int,
  anuncios_problema int,
  pontos_penalidade int,         -- soma dos pontos dos últimos 90 dias
  punicoes_ativas int,
  bruto jsonb,
  coletado_em timestamptz default now(),
  unique (loja_id, dia)
);
create table if not exists saude_metricas (
  id bigserial primary key,
  loja_id uuid not null,
  dia date not null,
  metric_id int not null,
  metric_type int,               -- 1 envio, 2 anúncios, 3 atendimento
  parent_metric_id int,
  nome text,
  atual numeric,
  anterior numeric,
  unidade int,                   -- 1 número, 2 %, 3 segundos, 4 dias, 5 horas
  alvo numeric,
  comparador text,
  isencao_ate text,
  fora_da_meta boolean,
  unique (loja_id, dia, metric_id)
);
create table if not exists saude_penalidades (
  id bigserial primary key,
  loja_id uuid not null,
  reference_id bigint not null default 0,
  issue_time timestamptz not null,
  violation_type int not null default 0,
  pontos_original int,
  pontos_atual int,
  visto_em timestamptz default now(),
  unique (loja_id, reference_id, issue_time, violation_type)
);
create table if not exists saude_punicoes (
  id bigserial primary key,
  loja_id uuid not null,
  reference_id bigint not null default 0,
  punishment_type int not null default 0,
  start_time timestamptz not null,
  issue_time timestamptz,
  end_time timestamptz,
  reason int,
  listing_limit int[],
  order_limit text,
  status int,                    -- 1 em vigor, 2 encerrada
  visto_em timestamptz default now(),
  unique (loja_id, reference_id, punishment_type, start_time)
);
create table if not exists saude_pedidos_atrasados (
  id bigserial primary key,
  loja_id uuid not null,
  dia date not null,
  order_sn text not null,
  shipping_deadline timestamptz,
  late_by_days int,
  unique (loja_id, dia, order_sn)
);
create table if not exists saude_anuncios_problema (
  id bigserial primary key,
  loja_id uuid not null,
  dia date not null,
  item_id bigint not null,
  reason int,
  unique (loja_id, dia, item_id)
);
create table if not exists saude_alertas (
  id bigserial primary key,
  loja_id uuid not null,
  chave text not null,
  dia date not null,
  texto text,
  enviado_em timestamptz default now(),
  unique (loja_id, chave, dia)
);
create index if not exists saude_metricas_loja_dia_idx on saude_metricas (loja_id, dia desc);
create index if not exists saude_penalidades_loja_idx on saude_penalidades (loja_id, issue_time desc);
grant select, insert, update, delete on saude_conta_snapshot, saude_metricas, saude_penalidades, saude_punicoes, saude_pedidos_atrasados, saude_anuncios_problema, saude_alertas to anon, authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;
