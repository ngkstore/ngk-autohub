-- ============================================================================
-- Tabela magra pedido_itens — FIX PERMANENTE da saturação por unnest de JSON.
--
-- Antes: rebuild_financas_cmv() desaninhava dados_pedido->item_list de ~70k
-- pedidos (JSON gordo) TODA vez → >100s → saturava o Nano.
--
-- Agora: os itens ficam explodidos numa tabela magra (sem JSON). Cada pedido
-- é desaninhado UMA vez; depois só os que mudam (marca-d'água atualizado_em,
-- que é confiável — 99% dos pedidos têm atualizado_em > criado_em). O CMV vira
-- uma JUNÇÃO INDEXADA sobre linhas pequenas → <1s até no Nano.
--
-- Custo NÃO é gravado aqui (só item_id/model_sku/qtd/preco) — a junção com
-- custos_variacao/produtos é feita no rebuild, então editar custo na tela
-- reflete na hora, sem re-desaninhar nada.
-- ============================================================================

create table if not exists pedido_itens (
  pedido_id uuid not null,
  loja_id   uuid not null,
  dia       date not null,
  uf        text not null default '—',
  item_id   text,
  model_sku text,
  variacao  text,
  qtd       numeric(14,2) not null default 0,
  preco     numeric(14,2)
);
create index if not exists pedido_itens_loja_dia_idx on pedido_itens (loja_id, dia);
create index if not exists pedido_itens_pedido_idx    on pedido_itens (pedido_id);
create index if not exists pedido_itens_sku_idx       on pedido_itens (loja_id, model_sku);

-- Índice p/ o sync incremental achar os pedidos alterados sem varrer o heap
-- gordo (sem ele o sync leva ~40s varrendo os 84k; com ele, <1s).
create index if not exists pedidos_atualizado_idx on pedidos (atualizado_em) where marketplace = 'shopee';

-- Marca-d'água do último sync (1 linha).
create table if not exists pedido_itens_sync (
  id int primary key default 1,
  ultimo_atualizado timestamptz not null default '1970-01-01',
  check (id = 1)
);
insert into pedido_itens_sync (id) values (1) on conflict (id) do nothing;

-- ---------------------------------------------------------------- SYNC (barato)
-- Reprocessa só os pedidos alterados desde o último sync. p_full=true refaz tudo.
create or replace function sync_pedido_itens(p_full boolean default false)
returns void language plpgsql security definer as $$
declare
  v_lo timestamptz;
  v_hi timestamptz;
begin
  if p_full then
    v_lo := '1970-01-01'::timestamptz;
  else
    select ultimo_atualizado into v_lo from pedido_itens_sync where id = 1;
  end if;
  select coalesce(max(atualizado_em), now()) into v_hi
    from pedidos where marketplace = 'shopee';

  -- apaga os itens dos pedidos que mudaram (inclui os que saíram de efetivado)
  delete from pedido_itens pi
  using pedidos p
  where pi.pedido_id = p.id
    and p.marketplace = 'shopee'
    and p.atualizado_em > v_lo;

  -- reinsere só os efetivados alterados
  insert into pedido_itens (pedido_id, loja_id, dia, uf, item_id, model_sku, variacao, qtd, preco)
  select p.id, p.loja_id,
    (coalesce(p.data_pagamento, p.data_pedido) at time zone 'America/Sao_Paulo')::date,
    coalesce(p.uf, '—'),
    (it->>'item_id'),
    upper(trim(it->>'model_sku')),
    (it->>'model_name'),
    greatest(coalesce(nullif(it->>'model_quantity_purchased','')::numeric, nullif(it->>'active_qty','')::numeric, 0)
      - coalesce(nullif(it->>'returned_qty','')::numeric,0) - coalesce(nullif(it->>'cancelled_qty','')::numeric,0), 0),
    case when coalesce(nullif(it->>'model_discounted_price','')::numeric,0) > 0
         then nullif(it->>'model_discounted_price','')::numeric
         else nullif(it->>'model_original_price','')::numeric end
  from pedidos p
  cross join lateral jsonb_array_elements(
    case jsonb_typeof(p.dados_pedido->'item_list') when 'array' then p.dados_pedido->'item_list' else '[]'::jsonb end) it
  where p.marketplace = 'shopee' and p.pedido_efetivado
    and coalesce(p.data_pagamento, p.data_pedido) is not null
    and p.atualizado_em > v_lo;

  update pedido_itens_sync set ultimo_atualizado = v_hi where id = 1;
end $$;
grant execute on function sync_pedido_itens(boolean) to anon, authenticated;

-- ------------------------------------------------- CMV a partir da tabela magra
-- Substitui o unnest pesado por junção indexada sobre pedido_itens.
create or replace function rebuild_financas_cmv()
returns void language plpgsql security definer as $$
begin
  drop table if exists _itens_custo;
  create temp table _itens_custo as
    select pi.loja_id, pi.dia, pi.uf, pi.item_id, pi.model_sku, pi.variacao, pi.qtd, pi.preco,
           coalesce(cv.custo, pr.custo) as custo
    from pedido_itens pi
    left join custos_variacao cv on cv.loja_id = pi.loja_id and cv.model_sku = pi.model_sku
    left join produtos pr        on pr.loja_id = pi.loja_id and pr.item_id  = pi.item_id;

  delete from financas_cmv_diario where true;
  insert into financas_cmv_diario (loja_id, dia, uf, cmv, unidades, itens_total, itens_com_custo)
  select loja_id, dia, uf,
    coalesce(sum(qtd*custo) filter (where custo is not null),0),
    coalesce(sum(qtd),0), count(*)::int,
    count(*) filter (where custo is not null)::int
  from _itens_custo group by 1,2,3;

  delete from variacoes_resumo where true;
  insert into variacoes_resumo
  select loja_id, item_id, model_sku, max(variacao), sum(qtd), sum(qtd*preco)
  from _itens_custo
  where dia >= ((now() at time zone 'America/Sao_Paulo')::date - 90) and coalesce(model_sku,'') <> ''
  group by 1,2,3;

  drop table if exists _itens_custo;
end $$;
grant execute on function rebuild_financas_cmv() to anon, authenticated;

-- Wrapper do cron pesado: sincroniza os itens (barato) e recalcula o CMV.
create or replace function refresh_cmv()
returns void language plpgsql security definer as $$
begin
  perform sync_pedido_itens(false);
  perform rebuild_financas_cmv();
end $$;
grant execute on function refresh_cmv() to anon, authenticated;

-- Redefine o wrapper do rebuild manual completo p/ sincronizar os itens antes
-- do CMV (senão um rebuild manual usaria pedido_itens possivelmente defasado).
create or replace function rebuild_financas_resumo_diario()
returns void language plpgsql security definer as $$
begin
  perform rebuild_financas_dre();
  perform refresh_cmv();
end $$;
grant execute on function rebuild_financas_resumo_diario() to anon, authenticated;
