-- Reforço automático de orçamento do dia (14/set/2026). Idempotente.
-- Regra (definida pelo Gabriel): enquanto o anúncio estiver performando, tem que ter
-- combustível. A cada 30 min o robô lê o gasto de HOJE por hora; se a campanha está
-- perto de esgotar o orçamento e o ROAS (7d e de hoje) está acima do mínimo, sobe o
-- orçamento em +30% (sem limite de vezes, só o teto diário da loja e o piso de saldo).
-- À meia-noite (00h05 BRT) tudo volta ao orçamento base.

alter table lojas add column if not exists ads_reforco_auto boolean default false;
alter table lojas add column if not exists ads_reforco_saldo_min numeric(12,2) default 300;  -- não reforça se saldo Ads < isso
alter table lojas add column if not exists ads_reforco_teto_dia numeric(12,2) default 2000; -- soma dos reforços por dia por loja

create table if not exists ads_reforcos (
  id              bigserial primary key,
  loja_id         uuid not null,
  campaign_id     bigint not null,
  item_id         bigint,
  dia             date not null,
  orcamento_base  numeric(12,2) not null,   -- valor antes do 1º reforço do dia (volta pra ele à meia-noite)
  orcamento_atual numeric(12,2) not null,
  reforcos        int default 0,
  historico       jsonb default '[]'::jsonb, -- [{hora, de, para, gasto, roas_hoje}]
  ultimo_em       timestamptz default now(),
  revertido_em    timestamptz,
  reversao_erro   text,
  unique (loja_id, campaign_id, dia)
);
create index if not exists ads_reforcos_dia_idx on ads_reforcos (dia, revertido_em);

-- Avisos que só podem ir 1× por dia por loja (ex.: saldo baixo).
create table if not exists ads_reforco_avisos (
  loja_id uuid not null, dia date not null, tipo text not null, criado_em timestamptz default now(),
  primary key (loja_id, dia, tipo)
);

grant select, insert, update on ads_reforcos to anon, authenticated;
grant usage, select on sequence ads_reforcos_id_seq to anon, authenticated;
grant select, insert on ads_reforco_avisos to anon, authenticated;

-- Liga nas lojas do Gabriel (NGK Store e Pitibiribas). Lojas dos amigos ficam desligadas
-- até eles autorizarem.
update lojas set ads_reforco_auto = true
  where id in ('329df5fb-0d8f-4eb5-af36-ff216152cedf', '697c3bf2-2aea-48ba-90b1-c2beda4e4f1f');
-- Essas duas contas têm recarga automática da Shopee quando o saldo bate R$50, então o
-- piso fica em R$40: só bloqueia (e avisa) se a recarga automática falhar.
update lojas set ads_reforco_saldo_min = 40
  where id in ('329df5fb-0d8f-4eb5-af36-ff216152cedf', '697c3bf2-2aea-48ba-90b1-c2beda4e4f1f');
