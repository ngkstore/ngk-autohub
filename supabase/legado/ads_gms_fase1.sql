-- FASE 1 do controle de Shopee Ads / GMV Max (spec §4), adaptado à convenção
-- MULTI-LOJA do sistema (toda tabela tem loja_id; a spec original era 1 loja só).

-- Histórico diário por item (append-only; unique impede duplicar ao rodar 2x).
create table if not exists ads_item_performance_daily (
  id           bigserial primary key,
  loja_id      uuid not null,
  dia          date not null,
  campaign_id  bigint not null,
  item_id      bigint not null,
  impressoes   int,
  cliques      int,
  ctr          numeric(8,4),
  conversoes   int,
  cr           numeric(8,4),
  pedidos      int,
  gmv          numeric(12,2),
  gasto        numeric(12,2),
  roas         numeric(8,2),          -- ROAS bruto reportado pela Shopee
  cpc          numeric(8,2),
  escopo       text check (escopo in ('direto','amplo')),
  bruto        jsonb,                 -- resposta crua (auditoria)
  atualizado_em timestamptz default now(),
  unique (loja_id, dia, item_id, escopo)
);
create index if not exists ads_item_perf_loja_dia_idx on ads_item_performance_daily (loja_id, dia);

-- Snapshot diário da config das campanhas (meta ROAS, orçamento, início).
create table if not exists ads_campaign_config_daily (
  loja_id      uuid not null,
  dia          date not null,
  campaign_id  bigint not null,
  item_id      bigint,
  ad_type      text,
  meta_roas    numeric(8,2),
  orcamento    numeric(12,2),
  data_inicio  date,                  -- pro período de aprendizado
  status       text,
  bruto        jsonb,
  atualizado_em timestamptz default now(),
  primary key (loja_id, dia, campaign_id)
);

-- Saldo de créditos por dia (alerta de saldo baixo).
create table if not exists ads_saldo_diario (
  loja_id      uuid not null,
  dia          date not null,
  saldo        numeric(12,2),
  atualizado_em timestamptz default now(),
  primary key (loja_id, dia)
);
