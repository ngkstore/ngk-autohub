-- Falhas de entrega (Shopee) entram no módulo de devoluções com tipo próprio.
-- Fonte: API de pedidos (CANCELLED por "Failed Delivery", pacote LOGISTICS_DELIVERY_FAILED)
-- + get_tracking_info (RETURN_STARTED → pacote de volta ao vendedor). plataforma_id = 'FE-<order_sn>'.
alter table public.devolucoes drop constraint if exists devolucoes_tipo_check;
alter table public.devolucoes add constraint devolucoes_tipo_check
  check (tipo = any (array['devolucao_reembolso','so_reembolso','troca','cancelamento','falha_entrega']));

create or replace function public.conferencia_devolucoes_etapas(p_loja_ids uuid[] default null)
returns json
language sql
stable
as $function$
  with d as (
    select *, (coalesce(upper(disputa_status), '') not in ('', 'NOT_NEEDED', 'NOT_REQUIRED', 'NONE')
            or coalesce(upper(compensacao_status), '') not in ('', 'NOT_NEEDED', 'NOT_REQUIRED', 'NONE')) as em_disputa
    from devolucoes where etapa <> 'encerrado' and (p_loja_ids is null or loja_id = any(p_loja_ids))
  )
  select json_build_object(
    'responder', count(*) filter (where etapa in ('resposta','solicitado')),
    'transito', count(*) filter (where etapa = 'voltando'),
    'coleta', count(*) filter (where etapa = 'coleta'),
    'validar', count(*) filter (where etapa in ('recebido','validar','inspecao')),
    'validar_devolucoes', count(*) filter (where etapa in ('recebido','validar','inspecao') and tipo <> 'falha_entrega'),
    'validar_falhas', count(*) filter (where etapa in ('recebido','validar','inspecao') and tipo = 'falha_entrega'),
    'falhas_entrega', count(*) filter (where tipo = 'falha_entrega'),
    'disputa', count(*) filter (where etapa = 'decisao' and em_disputa),
    'plataforma', count(*) filter (where etapa = 'decisao' and not em_disputa),
    'vencem_24h', count(*) filter (where prazo_resposta is not null and prazo_resposta > now() and prazo_resposta <= now() + interval '24 hours'),
    'vencidas', count(*) filter (where prazo_resposta is not null and prazo_resposta <= now())
  ) from d;
$function$;
