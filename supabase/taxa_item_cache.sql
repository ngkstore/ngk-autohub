-- Cache da taxa Shopee real por item (dos pedidos de 1 item só). Antes o
-- margem_catalogo calculava isso ao vivo escaneando os 350k+ pedido_itens — com
-- o array vindo por parâmetro (PostgREST), o plano genérico fazia seq scan e
-- estourava os 8s do role anon (a aba Produtos & Margem vinha vazia). Agora é
-- pré-calculado numa tabela pequena, rebuildada de hora em hora.

create table if not exists taxa_item_cache (
  loja_id uuid not null,
  item_id text not null,
  taxa numeric not null,
  vt numeric not null,
  primary key (loja_id, item_id)
);
create index if not exists taxa_item_cache_item_idx on taxa_item_cache (item_id);

create or replace function refresh_taxa_item() returns void
language plpgsql security definer as $$
begin
  delete from taxa_item_cache where true;
  insert into taxa_item_cache (loja_id, item_id, taxa, vt)
  select p.loja_id, s.item_id,
    sum(coalesce(p.taxa_comissao,0) + coalesce(p.taxa_servico,0)) as taxa,
    sum(p.valor_total) as vt
  from (
    select pedido_id, min(item_id) as item_id
    from pedido_itens group by pedido_id having count(*) = 1
  ) s
  join pedidos p on p.id = s.pedido_id
  where p.escrow_atualizado_em is not null and p.valor_total > 0
  group by p.loja_id, s.item_id;
end $$;
grant execute on function refresh_taxa_item() to anon, authenticated;

-- margem_catalogo agora lê a taxa do cache (não escaneia pedido_itens).
create or replace function margem_catalogo(
  p_loja_ids uuid[] default null,
  p_offset int default 0,
  p_limite int default 100,
  p_busca text default null
)
returns table(
  loja_id uuid, item_id text, produto text, model_sku text, variacao text,
  unidades numeric, preco numeric, custo numeric, taxa_pct numeric,
  margem_valor numeric, margem_pct numeric, sem_custo boolean, total_linhas bigint
)
language sql stable as $$
  with taxa_item as (
    select item_id, taxa, vt from taxa_item_cache
    where (p_loja_ids is null or loja_id = any(p_loja_ids))
  ),
  media as (select round(100.0 * sum(taxa) / nullif(sum(vt), 0), 1) as pct from taxa_item),
  base as (
    select vr.loja_id, vr.item_id, pr.nome as produto,
      norm_sku(vr.model_sku) as model_sku, max(vr.variacao) as variacao,
      sum(vr.un) as unidades,
      sum(vr.receita) / nullif(sum(vr.un), 0) as preco,
      max(cv.custo) as custo,
      coalesce(
        (select round(100.0 * ti.taxa / nullif(ti.vt, 0), 1) from taxa_item ti where ti.item_id = vr.item_id and ti.vt > 0),
        (select pct from media)
      ) as taxa_pct
    from variacoes_resumo vr
    left join produtos pr on pr.loja_id = vr.loja_id and pr.item_id = vr.item_id
    left join custos_variacao cv on cv.loja_id = vr.loja_id and norm_sku(cv.model_sku) = norm_sku(vr.model_sku)
    where (p_loja_ids is null or vr.loja_id = any(p_loja_ids))
      and (p_busca is null or pr.nome ilike '%'||p_busca||'%' or vr.model_sku ilike '%'||p_busca||'%')
    group by vr.loja_id, vr.item_id, pr.nome, norm_sku(vr.model_sku)
  ),
  calc as (
    select *, (preco - preco*taxa_pct/100 - preco*0.06 - coalesce(custo,0)) as margem_valor
    from base
  )
  select loja_id, item_id, coalesce(produto,'(produto sem nome)') as produto, model_sku, variacao,
    unidades, round(preco::numeric,2) as preco, custo, taxa_pct,
    round(margem_valor::numeric,2) as margem_valor,
    round(case when preco>0 then 100*margem_valor/preco else 0 end::numeric,1) as margem_pct,
    (custo is null) as sem_custo,
    count(*) over() as total_linhas
  from calc
  order by produto, item_id, model_sku
  offset p_offset limit p_limite;
$$;
grant execute on function margem_catalogo(uuid[], int, int, text) to anon, authenticated;

-- Popula agora. O agendamento no pg_cron ('rebuild-taxa-item', 13 * * * *) é
-- feito à parte (guardado contra job duplicado).
select refresh_taxa_item();
