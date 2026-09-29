-- ============================================================================
-- CMV DO TIKTOK (29/09/2026)
-- 1) pedido_itens ganha os itens do TikTok (dados_pedido->'line_items': 1 linha por
--    UNIDADE, sem quantity → agrupa por SKU e conta; item_id = product_id;
--    model_sku = seller_sku, que é o MESMO SKU usado na Shopee).
-- 2) rebuild_financas_cmv passa a buscar o custo também nas OUTRAS lojas da mesma
--    conta (os custos estão cadastrados na NGK Shopee, não na loja TikTok).
-- Idempotente.
-- ============================================================================

create index if not exists pedidos_atualizado_tiktok_idx on pedidos (atualizado_em) where marketplace = 'tiktok_shop';

-- ------------------------------------------------ itens do TikTok (incremental)
create or replace function sync_pedido_itens_tiktok(p_full boolean default false)
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
  select coalesce(max(atualizado_em), now()) into v_hi from pedidos where marketplace = 'tiktok_shop';

  delete from pedido_itens pi
  using pedidos p
  where pi.pedido_id = p.id and p.marketplace = 'tiktok_shop' and p.atualizado_em > v_lo;

  insert into pedido_itens (pedido_id, loja_id, dia, uf, item_id, model_sku, variacao, qtd, preco)
  select p.id, p.loja_id,
    (coalesce(p.data_pagamento, p.data_pedido) at time zone 'America/Sao_Paulo')::date,
    coalesce(p.uf, '—'),
    max(li->>'product_id'),
    upper(trim(li->>'seller_sku')),
    max(li->>'sku_name'),
    count(*)::numeric,                                   -- 1 line_item = 1 unidade
    round(avg(nullif(li->>'sale_price','')::numeric), 2)  -- preço pago por unidade (após desconto do vendedor)
  from pedidos p
  cross join lateral jsonb_array_elements(
    case jsonb_typeof(p.dados_pedido->'line_items') when 'array' then p.dados_pedido->'line_items' else '[]'::jsonb end) li
  where p.marketplace = 'tiktok_shop' and p.pedido_efetivado
    and coalesce(p.data_pagamento, p.data_pedido) is not null
    and p.atualizado_em > v_lo
    and coalesce(li->>'display_status','') not in ('CANCELLED','UNPAID')
    and coalesce(li->>'seller_sku','') <> ''
  group by p.id, p.loja_id, 3, 4, upper(trim(li->>'seller_sku'));

  -- marca-d'água compartilhada com o sync da Shopee (a maior das duas)
  update pedido_itens_sync set ultimo_atualizado = greatest(ultimo_atualizado, v_hi) where id = 1;
end $$;
grant execute on function sync_pedido_itens_tiktok(boolean) to anon, authenticated;

-- Carga inicial em faixas de data (a Management API derruba a conexão em ~100s;
-- o full de 45k pedidos não cabe numa chamada só). Reprocessa os pedidos
-- efetivados do TikTok com data no intervalo [p_ini, p_fim).
create or replace function sync_pedido_itens_tiktok_faixa(p_ini date, p_fim date)
returns int language plpgsql security definer as $$
declare v_n int;
begin
  delete from pedido_itens pi
  using pedidos p
  where pi.pedido_id = p.id and p.marketplace = 'tiktok_shop'
    and (coalesce(p.data_pagamento, p.data_pedido) at time zone 'America/Sao_Paulo')::date >= p_ini
    and (coalesce(p.data_pagamento, p.data_pedido) at time zone 'America/Sao_Paulo')::date <  p_fim;

  insert into pedido_itens (pedido_id, loja_id, dia, uf, item_id, model_sku, variacao, qtd, preco)
  select p.id, p.loja_id,
    (coalesce(p.data_pagamento, p.data_pedido) at time zone 'America/Sao_Paulo')::date,
    coalesce(p.uf, '—'),
    max(li->>'product_id'),
    upper(trim(li->>'seller_sku')),
    max(li->>'sku_name'),
    count(*)::numeric,
    round(avg(nullif(li->>'sale_price','')::numeric), 2)
  from pedidos p
  cross join lateral jsonb_array_elements(
    case jsonb_typeof(p.dados_pedido->'line_items') when 'array' then p.dados_pedido->'line_items' else '[]'::jsonb end) li
  where p.marketplace = 'tiktok_shop' and p.pedido_efetivado
    and coalesce(p.data_pagamento, p.data_pedido) is not null
    and (coalesce(p.data_pagamento, p.data_pedido) at time zone 'America/Sao_Paulo')::date >= p_ini
    and (coalesce(p.data_pagamento, p.data_pedido) at time zone 'America/Sao_Paulo')::date <  p_fim
    and coalesce(li->>'display_status','') not in ('CANCELLED','UNPAID')
    and coalesce(li->>'seller_sku','') <> ''
  group by p.id, p.loja_id, 3, 4, upper(trim(li->>'seller_sku'));
  get diagnostics v_n = row_count;
  return v_n;
end $$;
grant execute on function sync_pedido_itens_tiktok_faixa(date, date) to anon, authenticated;

-- sync_pedido_itens (Shopee) passa a chamar o do TikTok no fim. Reescrita da
-- função viva com a chamada extra; a marca-d'água é atualizada pelos dois.
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

  delete from pedido_itens pi
  using pedidos p
  where pi.pedido_id = p.id
    and p.marketplace = 'shopee'
    and p.atualizado_em > v_lo;

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

  -- TikTok usa a mesma marca-d'água (v_lo) e sobe a marca pra maior das duas
  perform sync_pedido_itens_tiktok(p_full);
  update pedido_itens_sync set ultimo_atualizado = greatest(ultimo_atualizado, v_hi) where id = 1;
end $$;
grant execute on function sync_pedido_itens(boolean) to anon, authenticated;

-- ------------------------------------------------ CMV: custo também de outras lojas da conta
create or replace function rebuild_financas_cmv()
returns void language plpgsql security definer as $$
begin
  drop table if exists _itens_custo;
  create temp table _itens_custo as
    select pi.loja_id, pi.dia, pi.uf, pi.item_id, pi.model_sku, pi.variacao, pi.qtd, pi.preco,
           coalesce(cv.custo, pr.custo, cvc.custo, prc.custo) as custo
    from pedido_itens pi
    left join lojas l on l.id = pi.loja_id
    -- 1º: custo cadastrado na própria loja (por SKU da variação, depois por item)
    left join custos_variacao cv on cv.loja_id = pi.loja_id and cv.model_sku = pi.model_sku
    left join produtos pr        on pr.loja_id = pi.loja_id and pr.item_id  = pi.item_id
    -- 2º: mesmo SKU em OUTRA loja da mesma conta (TikTok usa os SKUs da Shopee)
    left join lateral (
      select c2.custo from custos_variacao c2
      join lojas l2 on l2.id = c2.loja_id
      where l2.conta_id = l.conta_id and c2.loja_id <> pi.loja_id
        and c2.model_sku = pi.model_sku and c2.custo is not null
      order by c2.atualizado_em desc nulls last limit 1
    ) cvc on coalesce(pi.model_sku,'') <> ''
    left join lateral (
      select p2.custo from produtos p2
      join lojas l2 on l2.id = p2.loja_id
      where l2.conta_id = l.conta_id and p2.loja_id <> pi.loja_id
        and upper(trim(p2.sku)) = pi.model_sku and p2.custo is not null
      order by p2.atualizado_em desc nulls last limit 1
    ) prc on coalesce(pi.model_sku,'') <> '';

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
