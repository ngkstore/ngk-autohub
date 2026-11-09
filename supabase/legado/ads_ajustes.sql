-- Fase 4 (execução assistida) + painel do produto. Já aplicado no banco em 14/09/2026.
-- Idempotente. ads_ajustes = auditoria de cada edição feita pelo sistema na Shopee;
-- ads_item_gmv_real = GMV real (pedidos efetivados) por dia de um item.
create table if not exists ads_ajustes (
  id bigserial primary key, loja_id uuid not null, campaign_id bigint not null, item_id bigint,
  campo text not null, valor_antigo numeric, valor_novo numeric, reference_id text,
  simulado boolean default false, sucesso boolean, resposta jsonb, usuario text,
  criado_em timestamptz default now());
create index if not exists ads_ajustes_camp_idx on ads_ajustes (loja_id, campaign_id, criado_em desc);
grant select, insert on ads_ajustes to anon, authenticated;
grant usage, select on sequence ads_ajustes_id_seq to anon, authenticated;
create index if not exists pedido_itens_loja_item_dia_idx on pedido_itens (loja_id, item_id, dia);
create or replace function ads_item_gmv_real(p_loja uuid, p_item bigint, p_dias int default 28)
returns table(dia date, gmv_real numeric, unidades numeric, pedidos int) language sql stable as $$
  select pi.dia, sum(pi.qtd*pi.preco), sum(pi.qtd), count(distinct pi.pedido_id)::int
  from pedido_itens pi join pedidos p on p.id = pi.pedido_id
  where pi.loja_id = p_loja and pi.item_id = p_item::text and p.pedido_efetivado
    and pi.dia >= (now() at time zone 'America/Sao_Paulo')::date - p_dias
  group by pi.dia order by pi.dia;
$$;
grant execute on function ads_item_gmv_real(uuid, bigint, int) to anon, authenticated;
