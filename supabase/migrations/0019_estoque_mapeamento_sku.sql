-- Estoque: ligar o SKU do anúncio ao SKU do armazém (revisão de 12/11/2026).
--
-- Causas encontradas:
-- 1. 54 % das linhas de pedido_itens vinham com model_sku vazio (anúncio sem variação):
--    o sync só lia item_list[].model_sku e ignorava item_sku — que na Shopee é o próprio
--    SKU do UpSeller (ex.: balança item_sku BLCCZN10BR1). A venda sumia da tela Estoque.
-- 2. catalogo_mapeamento estava vazia. O UpSeller devolve o mapeamento em
--    page_product_sales_by_variation (productId/variationId da plataforma → variationSku
--    do armazém); o importador grava por (canal, loja, item_id, model_id).

-- 1) pedido_itens ganha model_id e passa a usar item_sku quando model_sku é vazio
alter table public.pedido_itens add column if not exists model_id text;

create or replace function public.sync_pedido_itens(p_full boolean default false)
returns void
language plpgsql
security definer
as $function$
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

  insert into pedido_itens (pedido_id, loja_id, dia, uf, item_id, model_id, model_sku, variacao, qtd, preco)
  select p.id, p.loja_id,
    (coalesce(p.data_pagamento, p.data_pedido) at time zone 'America/Sao_Paulo')::date,
    coalesce(p.uf, '—'),
    (it->>'item_id'),
    nullif(it->>'model_id', '0'),
    -- anúncio sem variação: model_sku vem vazio e o SKU está em item_sku
    upper(trim(coalesce(nullif(trim(it->>'model_sku'), ''), it->>'item_sku', ''))),
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

  perform sync_pedido_itens_tiktok(p_full);
  update pedido_itens_sync set ultimo_atualizado = greatest(ultimo_atualizado, v_hi) where id = 1;
end $function$;

create or replace function public.sync_pedido_itens_tiktok(p_full boolean default false)
returns void
language plpgsql
security definer
as $function$
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

  insert into pedido_itens (pedido_id, loja_id, dia, uf, item_id, model_id, model_sku, variacao, qtd, preco)
  select p.id, p.loja_id,
    (coalesce(p.data_pagamento, p.data_pedido) at time zone 'America/Sao_Paulo')::date,
    coalesce(p.uf, '—'),
    max(li->>'product_id'),
    max(li->>'sku_id'),
    upper(trim(li->>'seller_sku')),
    max(li->>'sku_name'),
    count(*)::numeric,
    round(avg(nullif(li->>'sale_price','')::numeric), 2)
  from pedidos p
  cross join lateral jsonb_array_elements(
    case jsonb_typeof(p.dados_pedido->'line_items') when 'array' then p.dados_pedido->'line_items' else '[]'::jsonb end) li
  where p.marketplace = 'tiktok_shop' and p.pedido_efetivado
    and coalesce(p.data_pagamento, p.data_pedido) is not null
    and p.atualizado_em > v_lo
    and coalesce(li->>'display_status','') not in ('CANCELLED','UNPAID')
    and coalesce(li->>'seller_sku','') <> ''
  group by p.id, p.loja_id, 3, 4, upper(trim(li->>'seller_sku'));

  update pedido_itens_sync set ultimo_atualizado = greatest(ultimo_atualizado, v_hi) where id = 1;
end $function$;

-- 2) mapeamento por item/variação da plataforma (fonte: UpSeller)
alter table public.catalogo_mapeamento alter column sku_anuncio drop not null;
alter table public.catalogo_mapeamento add column if not exists origem text default 'planilha';
alter table public.catalogo_mapeamento add column if not exists nome_produto text;
create unique index if not exists catalogo_mapeamento_item_idx
  on public.catalogo_mapeamento (canal, loja_id, item_id, coalesce(model_id, ''))
  where item_id is not null and item_id <> '';

-- lojas do UpSeller (shopId interno) → lojas do AutoHub
create table if not exists public.upseller_lojas (
  upseller_shop_id bigint primary key,
  nome text,
  plataforma text,
  loja_id uuid references public.lojas(id),
  atualizado_em timestamptz default now()
);
alter table public.upseller_lojas enable row level security;
insert into public.upseller_lojas (upseller_shop_id, nome, plataforma, loja_id) values
  (407573, 'SHOPEE NGK01', 'shopee', '329df5fb-0d8f-4eb5-af36-ff216152cedf'),
  (413789, 'SHOPEE PITIBIRIBAS1', 'shopee', '697c3bf2-2aea-48ba-90b1-c2beda4e4f1f'),
  (417768, 'NGKSTORE BR', 'tiktok', '447d4413-4a55-4167-9bb7-45f8ce70af30')
on conflict (upseller_shop_id) do update set nome = excluded.nome, plataforma = excluded.plataforma, loja_id = coalesce(public.upseller_lojas.loja_id, excluded.loja_id);

-- upsert em lote das linhas vindas do UpSeller: [{canal, loja_id, item_id, model_id, sku_armazem, nome_produto}]
create or replace function public.mapeamento_upsert_upseller(p_linhas jsonb)
returns integer
language plpgsql
security definer
as $function$
declare v_n integer;
begin
  insert into catalogo_mapeamento (canal, loja_id, item_id, model_id, sku_anuncio, sku_armazem, anormal, origem, nome_produto, atualizado_em)
  select x.canal, x.loja_id, x.item_id, coalesce(x.model_id, ''), null, x.sku_armazem, false, 'upseller', x.nome_produto, now()
  from jsonb_to_recordset(p_linhas) as x(canal text, loja_id uuid, item_id text, model_id text, sku_armazem text, nome_produto text)
  where x.item_id is not null and x.item_id <> '' and x.sku_armazem is not null and x.sku_armazem <> ''
  on conflict (canal, loja_id, item_id, coalesce(model_id, '')) where item_id is not null and item_id <> ''
  do update set sku_armazem = excluded.sku_armazem, nome_produto = excluded.nome_produto, origem = 'upseller', atualizado_em = now();
  get diagnostics v_n = row_count;
  -- preenche o SKU do anúncio (como aparece nos pedidos) para a aba Mapeamento
  update catalogo_mapeamento m set sku_anuncio = s.model_sku
  from (
    select distinct on (loja_id, item_id, coalesce(model_id, '')) loja_id, item_id, coalesce(model_id, '') as model_id, model_sku
    from pedido_itens where dia >= current_date - 60 and item_id is not null and model_sku <> ''
    order by loja_id, item_id, coalesce(model_id, ''), dia desc
  ) s
  where m.sku_anuncio is null and m.loja_id = s.loja_id and m.item_id = s.item_id and coalesce(m.model_id, '') = s.model_id
    and not exists (select 1 from catalogo_mapeamento o where o.canal = m.canal and o.loja_id = m.loja_id and o.sku_anuncio = s.model_sku and o.id <> m.id);
  return v_n;
end $function$;

-- 3) vendas por SKU do armazém: mapeia por item/variação (UpSeller) ou por SKU do anúncio (planilha); explode kits
create or replace function public.vendas_por_sku_armazem(p_inicio date, p_fim date, p_loja_ids uuid[] default null)
returns table(sku_armazem text, qtd numeric, receita numeric)
language sql
stable
as $function$
  with itens as (
    select i.loja_id, i.item_id, coalesce(i.model_id, '') as model_id, i.model_sku, i.qtd, coalesce(i.preco, 0) * i.qtd as receita
    from public.pedido_itens i
    where i.dia >= p_inicio and i.dia < p_fim and i.model_sku is not null and i.model_sku <> ''
      and (p_loja_ids is null or i.loja_id = any(p_loja_ids))
  ),
  mapeados as (
    select coalesce(m1.sku_armazem, m2.sku_armazem, it.model_sku) as sku, it.qtd, it.receita
    from itens it
    left join public.catalogo_mapeamento m1
      on m1.loja_id = it.loja_id and m1.item_id = it.item_id and coalesce(m1.model_id, '') = it.model_id and m1.item_id is not null and m1.item_id <> ''
    left join public.catalogo_mapeamento m2
      on m2.loja_id = it.loja_id and m2.sku_anuncio = it.model_sku
  ),
  explodido as (
    select coalesce(k.sku_componente, mp.sku) as sku, mp.qtd * coalesce(k.quantidade, 1) as qtd,
           case when k.sku_componente is null then mp.receita else 0 end as receita
    from mapeados mp left join public.kit_componentes k on k.sku_kit = mp.sku
  )
  select sku, sum(qtd), sum(receita) from explodido group by sku;
$function$;

-- SKUs de anúncio vendidos no período que não chegam a um SKU do armazém (para a aba Mapeamento)
create or replace function public.anuncios_sem_mapeamento(p_dias integer default 30, p_loja_ids uuid[] default null)
returns table(loja_id uuid, item_id text, model_id text, model_sku text, variacao text, qtd numeric)
language sql
stable
as $function$
  select i.loja_id, i.item_id, coalesce(i.model_id, ''), i.model_sku, max(i.variacao), sum(i.qtd)
  from public.pedido_itens i
  left join public.catalogo_mapeamento m1
    on m1.loja_id = i.loja_id and m1.item_id = i.item_id and coalesce(m1.model_id, '') = coalesce(i.model_id, '') and m1.item_id is not null and m1.item_id <> ''
  left join public.catalogo_mapeamento m2 on m2.loja_id = i.loja_id and m2.sku_anuncio = i.model_sku
  left join public.catalogo_sku c on c.sku = i.model_sku
  left join public.estoque_armazem e on e.sku = i.model_sku
  where i.dia >= current_date - p_dias and i.model_sku <> ''
    and (p_loja_ids is null or i.loja_id = any(p_loja_ids))
    and m1.id is null and m2.id is null and c.sku is null and e.sku is null
  group by 1, 2, 3, 4;
$function$;
