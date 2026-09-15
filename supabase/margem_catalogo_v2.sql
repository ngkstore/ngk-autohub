-- margem_catalogo v2 (14/set/2026). Idempotente.
-- O que mudou (pedido do Gabriel: itens sem custo não apareciam no /financas):
--   1) produtos SEM variação (model_sku vazio nos pedidos) ficavam fora do universo
--      (variacoes_resumo ignora model_sku vazio) -> agora entram como linha "produto inteiro";
--   2) produtos que NUNCA venderam (novos) também entram como "produto inteiro", com o
--      preço do catálogo, pra cadastrar o custo antes da primeira venda;
--   3) busca (p_busca) e filtro "só sem custo" (p_sem_custo) no servidor.
-- Custo da linha "produto inteiro" = custos_variacao pelo SKU do item, senão produtos.custo
-- (o input dessa linha grava em produtos.custo; a DRE e o motor de Ads já usam esse fallback).
-- A taxa Shopee por item vem do taxa_item_cache (refresh_taxa_item, pg_cron de hora em hora):
-- recalcular ao vivo varre 250k+ pedido_itens e estoura os 8s do role anon.
drop function if exists margem_catalogo(uuid[], int, int, text);
drop function if exists margem_catalogo(uuid[], int, int, text, boolean, boolean);
create or replace function margem_catalogo(
  p_loja_ids uuid[] default null,
  p_offset int default 0,
  p_limite int default 100,
  p_busca text default null,
  p_sem_custo boolean default false,
  p_incluir_sem_venda boolean default true
)
returns table(
  loja_id uuid, item_id text, produto text, model_sku text, variacao text,
  unidades numeric, preco numeric, custo numeric, taxa_pct numeric,
  margem_valor numeric, margem_pct numeric, sem_custo boolean, total_linhas bigint,
  produto_id uuid, fonte text
)
language sql stable as $$
  with taxa_item as (
    select loja_id, item_id, taxa, vt from taxa_item_cache
    where (p_loja_ids is null or loja_id = any(p_loja_ids))
  ),
  media as (select round(100.0 * sum(taxa) / nullif(sum(vt), 0), 1) as pct from taxa_item),
  -- (a) variações que venderam nos últimos 90 dias (como antes)
  vars as (
    select vr.loja_id, vr.item_id, pr.nome as produto,
      norm_sku(vr.model_sku) as model_sku, max(vr.variacao) as variacao,
      sum(vr.un) as unidades,
      sum(vr.receita) / nullif(sum(vr.un), 0) as preco,
      max(cv.custo) as custo,
      pr.id as produto_id, 'variacao'::text as fonte
    from variacoes_resumo vr
    left join produtos pr on pr.loja_id = vr.loja_id and pr.item_id = vr.item_id
    left join custos_variacao cv on cv.loja_id = vr.loja_id and norm_sku(cv.model_sku) = norm_sku(vr.model_sku)
    where (p_loja_ids is null or vr.loja_id = any(p_loja_ids))
    group by vr.loja_id, vr.item_id, pr.nome, pr.id, norm_sku(vr.model_sku)
  ),
  -- Quantas variações (com SKU) a API conhece de cada produto (produto_variacoes).
  -- 0 ou 1 = produto "de SKU único" (custo no item); 2+ = produto com variações.
  n_modelos as (
    select loja_id, item_id,
      count(*) filter (where status = 'MODEL_NORMAL' and coalesce(model_sku,'') <> '') as n
    from produto_variacoes
    where (p_loja_ids is null or loja_id = any(p_loja_ids))
    group by 1,2
  ),
  -- (c) variações conhecidas pela API que ainda NÃO venderam (90d): entram com preço
  -- atual e custo por variação (custos_variacao pelo model_sku), pra cadastrar antes
  -- da primeira venda.
  modelos as (
    select distinct on (pv.loja_id, pv.item_id, norm_sku(pv.model_sku))
      pv.loja_id, pv.item_id, pr.nome as produto,
      norm_sku(pv.model_sku) as model_sku, coalesce(nullif(pv.nome,''), '(variação)') as variacao,
      0::numeric as unidades, nullif(pv.preco, 0) as preco,
      (select max(cv.custo) from custos_variacao cv
        where cv.loja_id = pv.loja_id and norm_sku(cv.model_sku) = norm_sku(pv.model_sku)) as custo,
      pr.id as produto_id, 'modelo'::text as fonte
    from produto_variacoes pv
    join produtos pr on pr.loja_id = pv.loja_id and pr.item_id = pv.item_id
    join n_modelos nm on nm.loja_id = pv.loja_id and nm.item_id = pv.item_id and nm.n >= 2
    where p_incluir_sem_venda and pr.marketplace = 'shopee' and pr.status = 'NORMAL'
      and pv.status = 'MODEL_NORMAL' and coalesce(pv.model_sku,'') <> ''
      and (p_loja_ids is null or pv.loja_id = any(p_loja_ids))
      and not exists (select 1 from variacoes_resumo vr
                      where vr.loja_id = pv.loja_id and vr.item_id = pv.item_id and norm_sku(vr.model_sku) = norm_sku(pv.model_sku))
    order by pv.loja_id, pv.item_id, norm_sku(pv.model_sku), pv.model_id
  ),
  -- (b) produtos ativos sem nenhuma variação vendida E sem variações conhecidas (SKU
  -- único ou novo): linha do produto inteiro
  itens as (
    select pr.loja_id, pr.item_id, pr.nome as produto,
      norm_sku(pr.sku) as model_sku, '(produto inteiro)'::text as variacao,
      coalesce((select sum(pi.qtd) from pedido_itens pi join pedidos p on p.id = pi.pedido_id
                where pi.loja_id = pr.loja_id and pi.item_id = pr.item_id and p.pedido_efetivado
                  and pi.dia >= (now() at time zone 'America/Sao_Paulo')::date - 90), 0) as unidades,
      nullif(pr.preco, 0) as preco,
      coalesce((select max(cv.custo) from custos_variacao cv
                where cv.loja_id = pr.loja_id and coalesce(pr.sku,'') <> '' and norm_sku(cv.model_sku) = norm_sku(pr.sku)),
               pr.custo) as custo,
      pr.id as produto_id, 'item'::text as fonte
    from produtos pr
    where p_incluir_sem_venda and pr.marketplace = 'shopee' and pr.status = 'NORMAL'
      and (p_loja_ids is null or pr.loja_id = any(p_loja_ids))
      and not exists (select 1 from variacoes_resumo vr where vr.loja_id = pr.loja_id and vr.item_id = pr.item_id)
      and not exists (select 1 from n_modelos nm where nm.loja_id = pr.loja_id and nm.item_id = pr.item_id and nm.n >= 2)
  ),
  base0 as (select * from vars union all select * from modelos union all select * from itens),
  base as (
    select b.*,
      coalesce(
        (select round(100.0 * ti.taxa / nullif(ti.vt, 0), 1) from taxa_item ti
          where ti.loja_id = b.loja_id and ti.item_id = b.item_id and ti.vt > 0),
        (select pct from media)
      ) as taxa_pct
    from base0 b
    where (p_busca is null or p_busca = '' or b.produto ilike '%'||p_busca||'%' or b.model_sku ilike '%'||p_busca||'%' or b.item_id = p_busca)
      and (not p_sem_custo or b.custo is null)
  ),
  calc as (
    select *,
      (coalesce(preco,0) - coalesce(preco,0)*taxa_pct/100 - coalesce(preco,0)*0.06 - coalesce(custo,0)) as margem_valor
    from base
  )
  select loja_id, item_id, coalesce(produto,'(produto sem nome)') as produto, model_sku, variacao,
    unidades, round(preco::numeric,2) as preco, custo, taxa_pct,
    round(margem_valor::numeric,2) as margem_valor,
    round(case when preco>0 then 100*margem_valor/preco else 0 end::numeric,1) as margem_pct,
    (custo is null) as sem_custo,
    count(*) over() as total_linhas,
    produto_id, fonte
  from calc
  order by produto, item_id, model_sku
  offset p_offset limit p_limite;
$$;
grant execute on function margem_catalogo(uuid[], int, int, text, boolean, boolean) to anon, authenticated;
