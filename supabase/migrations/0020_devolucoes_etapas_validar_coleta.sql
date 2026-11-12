-- Devoluções Shopee: duas etapas novas, espelhando o Seller Center (revisão 12/11/2026).
--   validar = "Validar item" (pacote devolvido chegou: logistics_status LOGISTICS_DELIVERY_DONE,
--             prazo return_seller_due_date) e "Analisar reembolso aprovado pela Shopee"
--             (status ACCEPTED, return_solution 1, validation_type seller_validation, prazo due_date).
--   coleta  = "Agendar coleta" (logistics_status LOGISTICS_PENDING_ARRANGE, prazo return_ship_due_date).
-- Antes, esses casos caíam em "voltando" (Em trânsito) sem prazo de ação.
alter table public.devolucoes drop constraint if exists devolucoes_etapa_check;
alter table public.devolucoes add constraint devolucoes_etapa_check
  check (etapa = any (array['solicitado','resposta','voltando','coleta','recebido','validar','inspecao','decisao','encerrado']));

-- Conferência "tela × banco": contagem por etapa das devoluções abertas (mesma regra da fila).
create or replace function public.conferencia_devolucoes_etapas(p_loja_ids uuid[] default null)
returns json
language sql
stable
as $function$
  select json_build_object(
    'responder', count(*) filter (where etapa in ('resposta','solicitado')),
    'transito', count(*) filter (where etapa in ('voltando','coleta')),
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
