-- 11/11/2026 — B4: regras iniciais do módulo de Devoluções, DESLIGADAS (o Gabriel liga
-- uma a uma em /devolucoes/regras). conta_id null = vale para todas as contas.
-- Idempotente pelo nome.
insert into public.regras_devolucao (conta_id, ordem, ativa, nome, condicao, acao, modo)
select null, v.ordem, false, v.nome, v.condicao::jsonb, v.acao::jsonb, v.modo
from (values
  (10, 'Arrependimento até R$ 60 com produto lacrado → aprovar',
    '{"motivo_in":["CHANGE_OF_MIND","NO_LONGER_NEED","ecom_order_delivered_refund_and_return_reason_change_mind","DONT_WANT","WRONG_ITEM_ORDERED"],"valor_max":60,"lacrado":true}',
    '{"tipo":"aprovar"}', 'automatico'),
  (20, 'Na volta veio outro item ou peso 20% abaixo → disputar com quadros e peso',
    '{"chegou":true,"item_diferente":true}', '{"tipo":"disputar","provas":["quadros_abertura","peso"]}', 'aprovar'),
  (21, 'Peso na volta 20% abaixo do envio → disputar',
    '{"chegou":true,"peso_abaixo_pct":20}', '{"tipo":"disputar","provas":["quadros_abertura","peso"]}', 'aprovar'),
  (30, '''Não recebido'' com entrega confirmada e foto → disputar com comprovante',
    '{"nao_recebido_com_entrega":true}', '{"tipo":"disputar","provas":["comprovante_entrega"]}', 'aprovar'),
  (40, 'Defeito em produto até R$ 40 → oferecer 40% sem devolução',
    '{"motivo_in":["FUNCTIONAL","DAMAGE","DEFECT","ecom_order_delivered_refund_and_return_reason_damaged","ecom_order_delivered_refund_and_return_reason_defective"],"valor_max":40}',
    '{"tipo":"oferecer_parcial","valor_parcial_pct":40}', 'aprovar'),
  (50, 'Prazo com menos de 4 h → alerta no Telegram',
    '{"prazo_horas_max":4,"etapa_in":["resposta","decisao","recebido"]}', '{"tipo":"alerta"}', 'automatico'),
  (60, 'Pacote chegou ao armazém → tarefa de inspeção em até 24 h',
    '{"chegou":true,"etapa_in":["voltando","recebido"]}', '{"tipo":"tarefa_inspecao"}', 'automatico'),
  (70, 'Comprador com 3 ou mais devoluções em 90 dias → marcar suspeito',
    '{"devolucoes_90d_min":3}', '{"tipo":"marcar_suspeito"}', 'automatico'),
  (80, 'Disputa ganha sem crédito em 3 dias → alerta e texto de cobrança',
    '{"disputa_ganha_sem_credito_dias":3}', '{"tipo":"cobrar_credito"}', 'automatico')
) as v(ordem, nome, condicao, acao, modo)
where not exists (select 1 from public.regras_devolucao r where r.nome = v.nome and r.conta_id is null);
