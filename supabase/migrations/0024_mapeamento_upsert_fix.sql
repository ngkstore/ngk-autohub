-- mapeamento_upsert_upseller: ao preencher o SKU do anúncio (para exibição), dois itens
-- vendidos com o mesmo texto de SKU violavam unique(canal, loja_id, sku_anuncio).
-- Agora cada texto de SKU vai para UM item só (o mais vendido) e nunca repete um já usado.
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
  update catalogo_mapeamento m set sku_anuncio = s.model_sku
  from (
    select distinct on (loja_id, model_sku) loja_id, item_id, model_id, model_sku
    from (
      select i.loja_id, i.item_id, coalesce(i.model_id, '') as model_id, i.model_sku, sum(i.qtd) as q
      from pedido_itens i
      where i.dia >= current_date - 60 and i.item_id is not null and i.model_sku <> ''
      group by 1, 2, 3, 4
    ) t
    order by loja_id, model_sku, q desc
  ) s
  where m.sku_anuncio is null and m.loja_id = s.loja_id and m.item_id = s.item_id and coalesce(m.model_id, '') = s.model_id
    and not exists (select 1 from catalogo_mapeamento o where o.canal = m.canal and o.loja_id = m.loja_id and o.sku_anuncio = s.model_sku);
  return v_n;
end $function$;
