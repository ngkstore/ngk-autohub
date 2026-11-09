-- Catálogo unificado com MARGEM DE CONTRIBUIÇÃO REAL por produto/variação.
-- Fórmula (travada com o Gabriel): preço de venda − taxa Shopee REAL do item
--   − 5% (ads+afiliado) − 1% (imposto) − custo = margem (R$ e %).
-- Taxa real por item = comissão+serviço / venda, dos pedidos de 1 item só
-- (atribuição limpa); fallback = média efetiva da conta. Universo = variações
-- que já venderam (variacoes_resumo), com preço médio real (receita/un).

-- Normaliza o SKU (alguns vêm com \n/espaço) pra casar com custos_variacao.
create or replace function norm_sku(s text) returns text
language sql immutable as $$ select upper(regexp_replace(coalesce(s,''), '\s', '', 'g')) $$;

drop function if exists margem_catalogo(uuid[], int, int, text);
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
  with single as (
    select pedido_id, min(item_id) as item_id
    from pedido_itens group by pedido_id having count(*) = 1
  ),
  taxa_item as (
    select s.item_id,
      sum(coalesce(p.taxa_comissao,0) + coalesce(p.taxa_servico,0)) as taxa,
      sum(p.valor_total) as vt
    from single s
    join pedidos p on p.id = s.pedido_id
    where p.escrow_atualizado_em is not null and p.valor_total > 0
      and (p_loja_ids is null or p.loja_id = any(p_loja_ids))
    group by 1
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
    select *,
      (preco - preco*taxa_pct/100 - preco*0.06 - coalesce(custo,0)) as margem_valor
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
