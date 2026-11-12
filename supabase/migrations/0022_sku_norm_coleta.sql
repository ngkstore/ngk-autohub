-- Terceira revisão (12/11/2026).
-- 1) SKU normalizado dos dois lados ao casar anúncio × armazém: sem acento/cedilha,
--    maiúsculas, só letras e números (BLÇCZN10BR1 = BLCCZN10BR1 = "blccz n10br1").
create or replace function public.sku_norm(p text)
returns text
language sql
immutable
as $function$
  select upper(regexp_replace(translate(coalesce(p, ''), 'çÇãÃõÕáÁéÉíÍóÓúÚâÂêÊôÔàÀüÜñÑ', 'cCaAoOaAeEiIoOuUaAeEoOaAuUnN'), '[^A-Za-z0-9]', '', 'g'));
$function$;

create index if not exists estoque_armazem_sku_norm_idx on public.estoque_armazem (sku_norm(sku));
create index if not exists catalogo_sku_sku_norm_idx on public.catalogo_sku (sku_norm(sku));
create index if not exists catalogo_mapeamento_sku_anuncio_norm_idx on public.catalogo_mapeamento (loja_id, sku_norm(sku_anuncio));

-- SKU canônico do armazém para um texto qualquer (pela forma normalizada); senão devolve o próprio texto.
create or replace function public.sku_canonico(p text)
returns text
language sql
stable
as $function$
  select coalesce(
    (select e.sku from public.estoque_armazem e where sku_norm(e.sku) = sku_norm(p) limit 1),
    (select c.sku from public.catalogo_sku c where sku_norm(c.sku) = sku_norm(p) limit 1),
    p);
$function$;

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
      on m2.loja_id = it.loja_id and m2.sku_anuncio is not null and sku_norm(m2.sku_anuncio) = sku_norm(it.model_sku)
  ),
  -- agrupa pela forma normalizada e devolve o SKU canônico do armazém
  por_norm as (
    select sku_norm(sku) as norm, min(sku) as exemplo, sum(qtd) as qtd, sum(receita) as receita from mapeados group by 1
  ),
  canon as (
    select sku_canonico(exemplo) as sku, qtd, receita from por_norm
  ),
  explodido as (
    select coalesce(k.sku_componente, c.sku) as sku, c.qtd * coalesce(k.quantidade, 1) as qtd,
           case when k.sku_componente is null then c.receita else 0 end as receita
    from canon c left join public.kit_componentes k on sku_norm(k.sku_kit) = sku_norm(c.sku)
  )
  select sku, sum(qtd), sum(receita) from explodido group by sku;
$function$;

-- Anúncios vendidos sem ligação com o armazém, com unidades por dia (ordem de prioridade para mapear)
drop function if exists public.anuncios_sem_mapeamento(integer, uuid[]);
create or replace function public.anuncios_sem_mapeamento(p_dias integer default 30, p_loja_ids uuid[] default null)
returns table(loja_id uuid, item_id text, model_id text, model_sku text, variacao text, qtd numeric, por_dia numeric)
language sql
stable
as $function$
  select i.loja_id, i.item_id, coalesce(i.model_id, ''), i.model_sku, max(i.variacao), sum(i.qtd), round(sum(i.qtd) / greatest(p_dias, 1), 1)
  from public.pedido_itens i
  left join public.catalogo_mapeamento m1
    on m1.loja_id = i.loja_id and m1.item_id = i.item_id and coalesce(m1.model_id, '') = coalesce(i.model_id, '') and m1.item_id is not null and m1.item_id <> ''
    and exists (select 1 from public.estoque_armazem e where sku_norm(e.sku) = sku_norm(m1.sku_armazem))
  left join public.catalogo_mapeamento m2
    on m2.loja_id = i.loja_id and m2.sku_anuncio is not null and sku_norm(m2.sku_anuncio) = sku_norm(i.model_sku)
    and exists (select 1 from public.estoque_armazem e where sku_norm(e.sku) = sku_norm(m2.sku_armazem))
  left join public.catalogo_sku c on sku_norm(c.sku) = sku_norm(i.model_sku)
  left join public.estoque_armazem e on sku_norm(e.sku) = sku_norm(i.model_sku)
  where i.dia >= current_date - p_dias and i.model_sku <> ''
    and (p_loja_ids is null or i.loja_id = any(p_loja_ids))
    and m1.id is null and m2.id is null and c.sku is null and e.sku is null
  group by 1, 2, 3, 4
  order by 6 desc;
$function$;

-- 2) Devoluções: "Agendar coleta" como fila própria (fora de Em trânsito)
create or replace function public.conferencia_devolucoes_etapas(p_loja_ids uuid[] default null)
returns json
language sql
stable
as $function$
  select json_build_object(
    'responder', count(*) filter (where etapa in ('resposta','solicitado')),
    'transito', count(*) filter (where etapa = 'voltando'),
    'coleta', count(*) filter (where etapa = 'coleta'),
    'validar', count(*) filter (where etapa in ('recebido','validar','inspecao')),
    'disputa', count(*) filter (where etapa = 'decisao' and (disputa_status is not null or compensacao_status is not null)),
    'plataforma', count(*) filter (where etapa = 'decisao' and disputa_status is null and compensacao_status is null),
    'vencem_24h', count(*) filter (where prazo_resposta is not null and prazo_resposta > now() and prazo_resposta <= now() + interval '24 hours'),
    'vencidas', count(*) filter (where prazo_resposta is not null and prazo_resposta <= now())
  )
  from devolucoes
  where etapa <> 'encerrado' and (p_loja_ids is null or loja_id = any(p_loja_ids));
$function$;
