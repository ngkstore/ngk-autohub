-- ============================================================================
-- CUSTOS SHOPEE LINHA A LINHA — 3 camadas (espec. do Gabriel, 09/11/2026)
--   Camada 1: detalhamento de cada pedido (escrow) -> pedido_escrow (bruto) +
--             custos_pedido (uma linha por campo/sub-item).
--   Camada 2: carteira classificada por TIPO (não pelo texto) -> carteira_categorias
--             + classificar_carteira() + tabela de referência p/ conferência mensal.
--   Camada 3: custos fora da Shopee (já existem: custos_variacao/produtos.custo,
--             impostos) — a tela só os reúne.
-- Seguro rodar de novo (idempotente).
-- ============================================================================
set statement_timeout = '15min';

-- ────────────────────────────────────────────────────────────────────────────
-- CAMADA 2 · CARTEIRA
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists carteira_categorias (
  tipo text primary key,                 -- transaction_type da Open Platform (string)
  codigo int,                            -- nº do tipo no Seller Center (referência)
  categoria text not null,               -- chave usada pelo código/DRE
  grupo text not null,                   -- repasse | marketing | financeiro | estorno | compensacao | ajuste | imposto | logistica | afiliado | emprestimo | movimentacao
  rotulo text not null,                  -- como mostrar na tela
  entra_resultado boolean not null default false,
  observacao text
);

insert into carteira_categorias (tipo, codigo, categoria, grupo, rotulo, entra_resultado, observacao) values
 ('ESCROW_VERIFIED_ADD',                    101, 'renda',             'repasse',      'Renda do pedido',                         false, 'Repasse do pedido; o resultado vem do detalhamento (Camada 1)'),
 ('ESCROW_VERIFIED_MINUS',                  102, 'estorno',           'estorno',      'Renda do pedido (negativa)',              true,  'Estorno de venda'),
 ('FAST_ESCROW_DISBURSE',                   452, 'antecipacao',       'repasse',      'Resgate do Shopee Acelera',               false, 'Repasse antecipado em lote; não é receita nova'),
 ('FAST_ESCROW_DISBURSE_REMAINING',         459, 'antecipacao',       'repasse',      'Resgate restante do Acelera',             false, null),
 ('FAST_ESCROW_DEDUCT',                     458, 'acelera_taxa',      'financeiro',   'Taxa do Shopee Acelera',                  true,  'Custo financeiro da antecipação, por pedido'),
 ('ESCROW_DEDUCT',                          458, 'acelera_taxa',      'financeiro',   'Ajuste do Shopee Acelera',                true,  null),
 ('SPM_DEDUCT',                             502, 'ads',               'marketing',    'Recarga de Shopee Ads',                   true,  null),
 ('SPM_DEDUCT_DIRECT',                      801, 'emprestimo',        'emprestimo',   'Parcela do Empréstimo para Vendedores',   false, 'Dívida: principal fora do resultado (juros a cadastrar na Camada 3)'),
 ('SPM_DISBURSE_ADD',                       802, 'emprestimo_entrada','emprestimo',   'Empréstimo creditado',                    false, 'Entrada de dívida, não é receita'),
 ('PAID_BY_WALLET',                         501, 'pagamento_carteira','movimentacao', 'Pagamento no saldo da carteira',          false, 'Classificar pelo destino'),
 ('APM_DEDUCT',                             503, 'pagamento_carteira','movimentacao', 'Pagamento no saldo da carteira',          false, 'Classificar pelo destino'),
 ('ADJUSTMENT_FOR_RR_AFTER_ESCROW_VERIFIED',411, 'reembolso',         'estorno',      'Devolução / reembolso após o repasse',    true,  null),
 ('ADJUSTMENT_CENTER_DEDUCT',               407, 'ajuste_debito',     'ajuste',       'Ajuste da Shopee (débito)',               true,  'Subclassificado pelo texto: DIFAL, volumoso, peso cubado, crédito a maior'),
 ('ADJUSTMENT_CENTER_ADD',                  406, 'compensacao',       'compensacao',  'Ajuste a favor',                          true,  null),
 ('FULFILMENT_COMPENSATE_ADD',              474, 'compensacao',       'compensacao',  'Compensação do Full',                     true,  null),
 ('RETURN_COMPENSATION_SERVICE_ADD',        477, 'compensacao',       'compensacao',  'Compensação de devolução',                true,  null),
 ('LOST_PARCEL_SELLER_ADD',                 461, 'compensacao',       'compensacao',  'Pacote perdido (compensação)',            true,  null),
 ('SELLER_COMPENSATE_ADD',                  415, 'compensacao',       'compensacao',  'Compensação ao vendedor',                 true,  null),
 ('AMS_COMMISSION_FEE_DEDUCT',              463, 'afiliado_ajuste',   'afiliado',     'Ajuste de comissão de afiliado',          true,  'Afiliado cobrado depois do repasse'),
 ('AFFILIATE_FEE_DEDUCT',                   460, 'afiliado_ajuste',   'afiliado',     'Taxa de afiliado',                        true,  null),
 ('AFFILIATE_SAMPLE_SHIPPING_FEE_DEDUCT',   464, 'afiliado_ajuste',   'afiliado',     'Frete de amostra para afiliado',          true,  null),
 ('BR_DIFAL_FEE_CHARGE',                    445, 'difal',             'imposto',      'DIFAL',                                   true,  null),
 ('FBS_ADJUSTMENT_MINUS',                   405, 'logistica_full',    'logistica',    'Ajuste do Full',                          true,  null),
 ('FBS_FEE_CHARGE_MINUS',                   419, 'logistica_full',    'logistica',    'Taxa do Full',                            true,  null),
 ('WITHDRAWAL_CREATED',                    4000, 'saque',             'movimentacao', 'Saque para conta bancária',               false, null),
 ('WITHDRAWAL_COMPLETED',                  4001, 'saque',             'movimentacao', 'Saque concluído (valor zero)',            false, null),
 ('PIX_TRANSFER_SEND_CREATED',             5001, 'saque',             'movimentacao', 'Pix enviado',                             false, null),
 ('PIX_TRANSFER_SEND_COMPLETED',           5051, 'saque',             'movimentacao', 'Pix concluído (valor zero)',              false, null)
on conflict (tipo) do update set codigo = excluded.codigo, categoria = excluded.categoria, grupo = excluded.grupo,
  rotulo = excluded.rotulo, entra_resultado = excluded.entra_resultado, observacao = excluded.observacao;

-- Classificação por TIPO + subclassificação por palavra-chave onde o tipo é genérico.
create or replace function classificar_carteira(p_tipo text, p_descricao text)
returns text language sql stable as $$
  select case
    when p_tipo is null and p_descricao ilike '%reembolso por objeto perdido%' then 'compensacao'
    when p_tipo is null then 'desconhecido'
    when p_tipo = 'ADJUSTMENT_CENTER_DEDUCT' then case
        when p_descricao ilike '%DIFAL%' or p_descricao ilike '%diferencial de al%' then 'difal'
        when p_descricao ilike '%volumoso%' then 'logistica_volumoso'
        when p_descricao ilike '%peso cubado%' or p_descricao ilike '%cubad%' then 'logistica_peso'
        when p_descricao ilike '%creditado a maior%' then 'estorno_credito'
        else 'ajuste_debito' end
    when p_tipo = 'SPM_DEDUCT_DIRECT' and not (p_descricao ilike '%empr%stimo%' or p_descricao ilike '%loan%') then 'ads'
    else coalesce((select c.categoria from carteira_categorias c where c.tipo = p_tipo), 'desconhecido')
  end
$$;
grant execute on function classificar_carteira(text, text) to anon, authenticated;

-- Rótulo de uma categoria (inclui as subcategorias do 407).
create or replace function rotulo_categoria_carteira(p_categoria text)
returns text language sql stable as $$
  select case p_categoria
    when 'difal' then 'Imposto — DIFAL'
    when 'logistica_volumoso' then 'Logística — item volumoso'
    when 'logistica_peso' then 'Logística — diferença de peso'
    when 'estorno_credito' then 'Estorno de crédito a maior'
    when 'ajuste_debito' then 'Ajuste da Shopee (débito)'
    when 'desconhecido' then 'Tipo desconhecido'
    else coalesce((select min(c.rotulo) from carteira_categorias c where c.categoria = p_categoria), p_categoria)
  end
$$;
grant execute on function rotulo_categoria_carteira(text) to anon, authenticated;

-- Reclassifica o histórico inteiro pela regra nova (idempotente).
create or replace function reclassificar_carteira(p_loja uuid default null)
returns int language plpgsql security definer as $$
declare v int;
begin
  update carteira_transacoes t
  set categoria = classificar_carteira(t.tipo, t.descricao)
  where (p_loja is null or t.loja_id = p_loja)
    and t.categoria is distinct from classificar_carteira(t.tipo, t.descricao);
  get diagnostics v = row_count;
  return v;
end $$;
grant execute on function reclassificar_carteira(uuid) to anon, authenticated;

select reclassificar_carteira(null);

-- Tabela de referência (totais tirados da própria Shopee, fuso de Brasília).
create table if not exists carteira_referencia (
  loja_id uuid not null,
  mes text not null,              -- 'YYYY-MM' ou 'ANO' p/ total do período
  chave text not null,            -- renda | acelera | acelera_taxa | ads | reembolso | estorno | ajuste407 | afiliado463 | compensacoes
  valor numeric(14,2) not null,
  periodo_ini date, periodo_fim date,
  fonte text,
  primary key (loja_id, mes, chave)
);

-- NGK Store (329df5fb…) — 01/01 a 09/11/2026, get_transactions_total_meta.
with ref(mes, renda, acelera, acelera_taxa, ads, reembolso, estorno, ajuste407, afiliado463, compensacoes) as (values
 ('2026-01', 947441.58, 0, 0, -73000.00, -9048.52, -5163.72, -20.23, 0, 4388.91),
 ('2026-02', 868071.58, 0, 0, -76000.00, -8970.16, -5805.83, -38.38, -262.95, 1778.10),
 ('2026-03', 278820.00, 828805.57, -38897.73, -77000.00, -11806.66, -1042.55, -650.00, 0, 3569.74),
 ('2026-04', 1903.83, 738567.64, -45849.97, -54522.50, -8573.44, 0, -97.56, 0, 2953.03),
 ('2026-05', 17106.07, 708164.27, -57234.11, -51000.00, -3480.80, -2.94, 0, -76.09, 1666.19),
 ('2026-06', 617352.82, 9.59, -18872.41, -44500.00, -4057.01, -789.67, 0, 0, 1137.66),
 ('2026-07', 867065.55, 0, 0, -65600.00, -3986.74, -1813.59, 0, 0, 3381.37),
 ('2026-08', 759842.78, 0, 0, -54500.00, -10457.85, -2841.75, -23.44, 0, 2283.00),
 ('2026-09', 628713.56, 0, 0, -60000.00, -7826.85, -2002.68, -138.07, 0, 1935.33),
 ('2026-10', 732367.34, 0, 0, -49500.00, -9745.73, -3571.22, -157.25, -22.42, 1418.71),
 ('2026-11', 66972.05, 224459.47, -5290.23, -15100.00, -4198.83, -464.09, -105.21, 0, 88.52)
), linhas as (
  select mes, 'renda' chave, renda v from ref union all
  select mes, 'acelera', acelera from ref union all
  select mes, 'acelera_taxa', acelera_taxa from ref union all
  select mes, 'ads', ads from ref union all
  select mes, 'reembolso', reembolso from ref union all
  select mes, 'estorno', estorno from ref union all
  select mes, 'ajuste407', ajuste407 from ref union all
  select mes, 'afiliado463', afiliado463 from ref union all
  select mes, 'compensacoes', compensacoes from ref
)
insert into carteira_referencia (loja_id, mes, chave, valor, periodo_ini, periodo_fim, fonte)
select '329df5fb-0d8f-4eb5-af36-ff216152cedf', mes, chave, v,
       (mes||'-01')::date, case when mes = '2026-11' then date '2026-11-09' else ((mes||'-01')::date + interval '1 month' - interval '1 day')::date end,
       'Seller Center get_transactions_total_meta 09/11/2026'
from linhas
on conflict (loja_id, mes, chave) do update set valor = excluded.valor, periodo_ini = excluded.periodo_ini, periodo_fim = excluded.periodo_fim, fonte = excluded.fonte;

-- Pitibiribas (697c3bf2…) — totais 01/01 a 08/11/2026 (sem detalhe mensal ainda).
insert into carteira_referencia (loja_id, mes, chave, valor, periodo_ini, periodo_fim, fonte) values
 ('697c3bf2-2aea-48ba-90b1-c2beda4e4f1f', 'ANO', 'ads',          -282800.00, '2026-01-01', '2026-11-08', 'Seller Center 09/11/2026'),
 ('697c3bf2-2aea-48ba-90b1-c2beda4e4f1f', 'ANO', 'acelera_taxa',  -86607.04, '2026-01-01', '2026-11-08', 'Seller Center 09/11/2026'),
 ('697c3bf2-2aea-48ba-90b1-c2beda4e4f1f', 'ANO', 'reembolso',     -27232.23, '2026-01-01', '2026-11-08', 'Seller Center 09/11/2026'),
 ('697c3bf2-2aea-48ba-90b1-c2beda4e4f1f', 'ANO', 'estorno',        -7335.15, '2026-01-01', '2026-11-08', 'Seller Center 09/11/2026'),
 ('697c3bf2-2aea-48ba-90b1-c2beda4e4f1f', 'ANO', 'ajuste407',        -276.06, '2026-01-01', '2026-11-08', 'Seller Center 09/11/2026'),
 ('697c3bf2-2aea-48ba-90b1-c2beda4e4f1f', 'ANO', 'afiliado463',       -89.37, '2026-01-01', '2026-11-08', 'Seller Center 09/11/2026')
on conflict (loja_id, mes, chave) do update set valor = excluded.valor, periodo_ini = excluded.periodo_ini, periodo_fim = excluded.periodo_fim, fonte = excluded.fonte;

-- Chave de referência de cada transação (agrupa tipos como a Shopee agrupa).
create or replace function chave_referencia_carteira(p_tipo text, p_categoria text)
returns text language sql immutable as $$
  select case
    when p_tipo = 'ESCROW_VERIFIED_ADD' then 'renda'
    when p_tipo in ('FAST_ESCROW_DISBURSE','FAST_ESCROW_DISBURSE_REMAINING') then 'acelera'
    when p_tipo in ('FAST_ESCROW_DEDUCT','ESCROW_DEDUCT') then 'acelera_taxa'
    when p_categoria = 'ads' then 'ads'
    when p_tipo = 'ADJUSTMENT_FOR_RR_AFTER_ESCROW_VERIFIED' then 'reembolso'
    when p_tipo = 'ESCROW_VERIFIED_MINUS' then 'estorno'
    when p_tipo = 'ADJUSTMENT_CENTER_DEDUCT' then 'ajuste407'
    when p_tipo = 'AMS_COMMISSION_FEE_DEDUCT' then 'afiliado463'
    when p_tipo in ('ADJUSTMENT_CENTER_ADD','FULFILMENT_COMPENSATE_ADD','RETURN_COMPENSATION_SERVICE_ADD','LOST_PARCEL_SELLER_ADD','SELLER_COMPENSATE_ADD') then 'compensacoes'
    else null end
$$;

-- Conferência 3 · mês × referência (tolerância R$ 0,05).
create or replace function conferencia_carteira_mes(p_loja uuid)
returns table(mes text, chave text, referencia numeric, autohub numeric, diferenca numeric, ok boolean)
language sql stable as $$
  with ref as (select * from carteira_referencia where loja_id = p_loja),
  aut as (
    select r.mes, r.chave, coalesce(sum(t.valor), 0) as v
    from ref r
    left join carteira_transacoes t
      on t.loja_id = r.loja_id
     and chave_referencia_carteira(t.tipo, t.categoria) = r.chave
     and (t.criado_em at time zone 'America/Sao_Paulo')::date between r.periodo_ini and r.periodo_fim
    group by r.mes, r.chave
  )
  select r.mes, r.chave, r.valor, round(a.v, 2), round(a.v - r.valor, 2), abs(a.v - r.valor) <= 0.05
  from ref r join aut a on a.mes = r.mes and a.chave = r.chave
  order by r.mes, r.chave;
$$;
grant execute on function conferencia_carteira_mes(uuid) to anon, authenticated;

-- Conferência 8 · tipos de carteira desconhecidos.
create or replace function conferencia_carteira_desconhecidos(p_loja_ids uuid[] default null)
returns table(loja_id uuid, tipo text, descricao text, qtd bigint, total numeric, ultimo timestamptz)
language sql stable as $$
  select t.loja_id, t.tipo, left(min(t.descricao), 90), count(*), round(sum(t.valor), 2), max(t.criado_em)
  from carteira_transacoes t
  where t.categoria = 'desconhecido' and (p_loja_ids is null or t.loja_id = any(p_loja_ids))
  group by t.loja_id, t.tipo order by count(*) desc;
$$;
grant execute on function conferencia_carteira_desconhecidos(uuid[]) to anon, authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- CAMADA 1 · DETALHAMENTO DO PEDIDO (escrow)
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists pedido_escrow (
  loja_id uuid not null,
  order_sn text not null,
  income jsonb not null,
  buyer jsonb,
  atualizado_em timestamptz not null default now(),
  primary key (loja_id, order_sn)
);
create index if not exists pedido_escrow_atual_idx on pedido_escrow (atualizado_em);

create table if not exists custos_pedido (
  loja_id uuid not null,
  order_sn text not null,
  campo text not null,                  -- chave estável da linha (ex.: comissao_bruta, serv_1000075)
  rotulo text,                          -- nome na tela
  grupo text,                           -- produtos | frete | taxas | afiliado | outros | total | memo
  categoria text,                       -- receita | cupom_shopee | frete | comissao | comissao_rebate | serv_transacao | serv_item | serv_rebate | serv_afiliado | serv_outros | afiliado | taxa_outros | compensacao | repasse | memo | residual
  valor numeric(14,2) not null default 0,
  soma boolean not null default true,   -- entra na soma que tem de dar o repasse
  data_pedido timestamptz,
  primary key (loja_id, order_sn, campo)
);
create index if not exists custos_pedido_cat_idx on custos_pedido (loja_id, categoria, data_pedido);
create index if not exists custos_pedido_data_idx on custos_pedido (loja_id, data_pedido);

-- Regras da "taxa de serviço" (sub-itens de net_service_fee_info_list) por rule_id.
create table if not exists escrow_regras_servico (
  rule_id bigint primary key,
  categoria text not null,              -- serv_transacao | serv_item | serv_afiliado | serv_outros
  rotulo text not null
);
insert into escrow_regras_servico (rule_id, categoria, rotulo) values
 (1000074, 'serv_transacao', 'Taxa de transação'),
 (1000075, 'serv_item',      'Taxa por item vendido')
on conflict (rule_id) do update set categoria = excluded.categoria, rotulo = excluded.rotulo;

create or replace function jnum(j jsonb, k text) returns numeric language sql immutable as $$
  select case when j ? k and jsonb_typeof(j->k) = 'number' then (j->>k)::numeric else 0 end
$$;

-- Gera as linhas de custo de UM pedido a partir do escrow bruto.
-- Convenção: valor positivo entra, negativo sai; soma(linhas com soma=true) = escrow_amount.
create or replace function custos_pedido_linhas(inc jsonb, buy jsonb)
returns table(campo text, rotulo text, grupo text, categoria text, valor numeric, soma boolean)
language sql immutable as $$
  with base as (
    select
      jnum(inc,'order_selling_price') as venda,
      jnum(inc,'voucher_from_shopee') as cupom_shopee,
      jnum(inc,'coins') as moedas,
      jnum(inc,'payment_promotion') as promo_pgto,
      jnum(inc,'credit_card_promotion') as promo_cartao,
      jnum(inc,'buyer_paid_shipping_fee') as frete_comprador,
      jnum(inc,'actual_shipping_fee') as frete_real,
      jnum(inc,'shopee_shipping_rebate') as frete_rebate,
      jnum(inc,'shipping_fee_discount_from_3pl') as frete_desc_3pl,
      jnum(inc,'seller_shipping_discount') as frete_desc_vendedor,
      jnum(inc,'reverse_shipping_fee') as frete_reverso,
      jnum(inc,'final_return_to_seller_shipping_fee') as frete_retorno,
      jnum(inc,'commission_fee') as comissao_bruta,
      jnum(inc->'seller_product_rebate','commission_fee_offset') as comissao_rebate,
      jnum(inc->'seller_product_rebate','service_fee_offset') as serv_rebate,
      jnum(inc,'service_fee') as serv_bruta,
      jnum(inc,'net_service_fee') as serv_liquida,
      jnum(inc,'order_ams_commission_fee') as afiliado,
      jnum(inc,'seller_transaction_fee') as tx_vendedor,
      jnum(inc,'campaign_fee') as campanha,
      jnum(inc,'fbs_fee') as fbs,
      jnum(inc,'sspl_fee') as sspl,
      jnum(inc,'return_handling_fee') as manuseio_dev,
      jnum(inc,'pay_per_sale') as pay_per_sale,
      jnum(inc,'ads_escrow_top_up_fee_or_technical_support_fee') as ads_top_up,
      jnum(inc,'seller_lost_compensation') as comp_perda,
      jnum(inc,'seller_coin_cash_back') as cashback,
      jnum(inc,'escrow_tax') as imposto_escrow,
      jnum(inc,'withholding_tax') as retencao,
      jnum(inc,'final_product_protection') as protecao,
      jnum(inc,'escrow_amount') as repasse
  ),
  servicos as (
    select coalesce(nullif(s->>'rule_id','')::bigint, 0) as rule_id,
           coalesce(s->>'rule_display_name','') as nome,
           coalesce(nullif(s->>'fee_amount','')::numeric, 0) as fee
    from jsonb_array_elements(case when jsonb_typeof(inc->'net_service_fee_info_list') = 'array' then inc->'net_service_fee_info_list' else '[]'::jsonb end) s
  ),
  linhas as (
    -- Produtos
    select 'venda'::text campo, 'Preço de venda (após descontos)'::text rotulo, 'produtos'::text grupo, 'receita'::text categoria, venda valor, true soma from base
    union all select 'cupom_shopee', 'Cupom pago pela Shopee', 'produtos', 'cupom_shopee', cupom_shopee, true from base
    union all select 'moedas', 'Moedas Shopee', 'produtos', 'cupom_shopee', moedas, true from base
    union all select 'promo_pagamento', 'Promoção de pagamento (Shopee)', 'produtos', 'cupom_shopee', promo_pgto, true from base
    union all select 'promo_cartao', 'Promoção de cartão (Shopee)', 'produtos', 'cupom_shopee', promo_cartao, true from base
    -- Frete (51 + 52 + 54 = 50)
    union all select 'frete_comprador', 'Frete pago pelo comprador', 'frete', 'frete', frete_comprador, true from base
    union all select 'frete_real', 'Frete cobrado pelo parceiro logístico', 'frete', 'frete', -frete_real, true from base
    union all select 'frete_rebate', 'Desconto de frete pago pela Shopee', 'frete', 'frete', frete_rebate, true from base
    union all select 'frete_desc_3pl', 'Desconto de frete da transportadora', 'frete', 'frete', frete_desc_3pl, true from base
    union all select 'frete_desc_vendedor', 'Desconto de frete do vendedor', 'frete', 'frete', -frete_desc_vendedor, true from base
    union all select 'frete_reverso', 'Frete de devolução (reverso)', 'frete', 'frete', -frete_reverso, true from base
    union all select 'frete_retorno', 'Frete de retorno ao vendedor', 'frete', 'frete', -frete_retorno, true from base
    -- Taxas Shopee
    union all select 'comissao_bruta', 'Taxa de comissão bruta', 'taxas', 'comissao', -comissao_bruta, true from base
    union all select 'comissao_rebate', 'Abatimento de comissão (ação comercial / Pix)', 'taxas', 'comissao_rebate', comissao_rebate, true from base
    union all select 'serv_' || s.rule_id, coalesce(r.rotulo, nullif(s.nome,''), 'Taxa de serviço (regra ' || s.rule_id || ')'), 'taxas',
                     case when s.nome ilike '%afili%' then 'serv_afiliado' else coalesce(r.categoria, 'serv_outros') end,
                     -s.fee, true
             from servicos s left join escrow_regras_servico r on r.rule_id = s.rule_id
    union all select 'serv_rebate', 'Abatimento da taxa de serviço (ação comercial / Pix)', 'taxas', 'serv_rebate', serv_rebate, false from base
    union all select 'serv_bruta', 'Taxa de serviço bruta (total)', 'taxas', 'memo', -serv_bruta, false from base
    union all select 'tx_vendedor', 'Taxa de transação do vendedor', 'taxas', 'taxa_outros', -tx_vendedor, true from base
    union all select 'campanha', 'Taxa de campanha', 'taxas', 'taxa_outros', -campanha, true from base
    union all select 'fbs', 'Taxa do Full (FBS)', 'taxas', 'taxa_outros', -fbs, true from base
    union all select 'sspl', 'Taxa SSPL', 'taxas', 'taxa_outros', -sspl, true from base
    union all select 'manuseio_devolucao', 'Taxa de manuseio de devolução', 'taxas', 'taxa_outros', -manuseio_dev, true from base
    union all select 'pay_per_sale', 'Pay per sale', 'taxas', 'taxa_outros', -pay_per_sale, true from base
    union all select 'ads_top_up', 'Ads (recarga pelo escrow) / suporte técnico', 'taxas', 'taxa_outros', -ads_top_up, true from base
    union all select 'cashback_moedas', 'Cashback em moedas (vendedor)', 'taxas', 'taxa_outros', -cashback, true from base
    union all select 'imposto_escrow', 'Imposto retido no escrow', 'taxas', 'taxa_outros', -imposto_escrow, true from base
    union all select 'retencao', 'Retenção na fonte', 'taxas', 'taxa_outros', -retencao, true from base
    -- Afiliado
    union all select 'afiliado_comissao', 'Taxa de comissão Afiliados do Vendedor', 'afiliado', 'afiliado', -afiliado, true from base
    -- Compensações dentro do pedido
    union all select 'compensacao_perda', 'Compensação por perda (vendedor)', 'outros', 'compensacao', comp_perda, true from base
    union all select 'protecao_produto', 'Proteção do produto', 'outros', 'compensacao', protecao, true from base
    -- Memo (não somam)
    union all select 'preco_original', 'Preço original', 'memo', 'memo', jnum(inc,'order_original_price'), false from base
    union all select 'desconto_vendedor', 'Desconto do vendedor', 'memo', 'memo', -jnum(inc,'order_seller_discount'), false from base
    union all select 'desconto_plataforma', 'Desconto da plataforma / Pix (compensado nos abatimentos)', 'memo', 'memo', -jnum(inc,'original_shopee_discount'), false from base
    union all select 'cupom_vendedor', 'Cupom do vendedor', 'memo', 'memo', -jnum(inc,'voucher_from_seller'), false from base
    union all select 'devolucao_vendedor', 'Reembolso ao comprador (devolução)', 'memo', 'memo', jnum(inc,'seller_return_refund'), false from base
    union all select 'drc_ajustavel', 'Reembolso ajustável (DRC)', 'memo', 'memo', jnum(inc,'drc_adjustable_refund'), false from base
    union all select 'comprador_pagou', 'Total pago pelo comprador', 'memo', 'memo', jnum(inc,'buyer_total_amount'), false from base
    union all select 'ajuste_total', 'Ajustes posteriores (total)', 'memo', 'memo', jnum(inc,'total_adjustment_amount'), false from base
    union all select 'repasse_ajustado', 'Renda do pedido após ajustes', 'total', 'memo', jnum(inc,'escrow_amount_after_adjustment'), false from base
  ),
  tot as (select coalesce(sum(valor) filter (where soma), 0) as s from linhas)
  select l.campo, l.rotulo, l.grupo, l.categoria, round(l.valor, 2), l.soma from linhas l where l.valor <> 0 or l.campo = 'venda'
  union all select 'repasse', 'Renda do pedido', 'total', 'repasse', round(b.repasse, 2), false from base b
  union all select 'residual', 'Não mapeado (repasse − soma das linhas)', 'total', 'residual', round(b.repasse - t.s, 2), false from base b, tot t
$$;

-- (Re)gera as linhas de uma lista de pedidos a partir do bruto guardado.
create or replace function rebuild_custos_pedido(p_loja uuid, p_order_sns text[])
returns int language plpgsql security definer as $$
declare v int;
begin
  delete from custos_pedido where loja_id = p_loja and order_sn = any(p_order_sns);
  insert into custos_pedido (loja_id, order_sn, campo, rotulo, grupo, categoria, valor, soma, data_pedido)
  select e.loja_id, e.order_sn, l.campo, l.rotulo, l.grupo, l.categoria, l.valor, l.soma, p.data_pedido
  from pedido_escrow e
  left join pedidos p on p.loja_id = e.loja_id and p.pedido_externo_id = e.order_sn and p.marketplace = 'shopee'
  cross join lateral custos_pedido_linhas(e.income, e.buyer) l
  where e.loja_id = p_loja and e.order_sn = any(p_order_sns);
  get diagnostics v = row_count;
  return v;
end $$;
grant execute on function rebuild_custos_pedido(uuid, text[]) to anon, authenticated;

-- Regera TODOS os pedidos de uma loja em blocos (p/ quando o mapeamento muda).
create or replace function rebuild_custos_pedido_todos(p_loja uuid, p_bloco int default 2000)
returns int language plpgsql security definer as $$
declare lote text[]; total int := 0; n int;
begin
  loop
    select array_agg(order_sn) into lote from (
      select e.order_sn from pedido_escrow e
      where e.loja_id = p_loja
        and not exists (select 1 from custos_pedido c where c.loja_id = e.loja_id and c.order_sn = e.order_sn and c.campo = 'repasse')
      limit p_bloco) x;
    exit when lote is null;
    n := rebuild_custos_pedido(p_loja, lote);
    total := total + n;
  end loop;
  return total;
end $$;
grant execute on function rebuild_custos_pedido_todos(uuid, int) to anon, authenticated;

-- Conferência 1 · pedido fecha (soma das linhas = repasse, tolerância R$ 0,01).
create or replace function conferencia_pedido_fecha(p_loja_ids uuid[] default null, p_inicio timestamptz default null, p_fim timestamptz default null, p_limite int default 50)
returns json language sql stable as $$
  with r as (
    select c.loja_id, c.order_sn, c.valor as residual, c.data_pedido
    from custos_pedido c
    where c.campo = 'residual'
      and (p_loja_ids is null or c.loja_id = any(p_loja_ids))
      and (p_inicio is null or c.data_pedido >= p_inicio) and (p_fim is null or c.data_pedido < p_fim)
  ),
  desconhecidos as (
    select c.rotulo, count(*) as qtd, round(sum(c.valor),2) as total
    from custos_pedido c
    where c.categoria = 'serv_outros'
      and (p_loja_ids is null or c.loja_id = any(p_loja_ids))
      and (p_inicio is null or c.data_pedido >= p_inicio) and (p_fim is null or c.data_pedido < p_fim)
    group by c.rotulo
  )
  select json_build_object(
    'total', (select count(*) from r),
    'ok', (select count(*) from r where abs(residual) <= 0.01),
    'diferenca', (select count(*) from r where abs(residual) > 0.01),
    'diferenca_valor', (select coalesce(round(sum(abs(residual)),2),0) from r where abs(residual) > 0.01),
    'exemplos', (select coalesce(json_agg(json_build_object('order_sn', order_sn, 'residual', residual, 'data', data_pedido) order by abs(residual) desc), '[]'::json)
                 from (select * from r where abs(residual) > 0.01 order by abs(residual) desc limit p_limite) x),
    'campos_desconhecidos', (select coalesce(json_agg(row_to_json(d)), '[]'::json) from desconhecidos d)
  );
$$;
grant execute on function conferencia_pedido_fecha(uuid[], timestamptz, timestamptz, int) to anon, authenticated;

-- Conferência 2 · pedido × carteira (repasse do detalhamento × tipo 101 do mesmo order_sn).
create or replace function conferencia_pedido_carteira(p_loja_ids uuid[] default null, p_inicio timestamptz default null, p_fim timestamptz default null, p_limite int default 50)
returns json language sql stable as $$
  with rep as (
    select c.loja_id, c.order_sn, c.valor as repasse, c.data_pedido
    from custos_pedido c
    where c.campo = 'repasse'
      and (p_loja_ids is null or c.loja_id = any(p_loja_ids))
      and (p_inicio is null or c.data_pedido >= p_inicio) and (p_fim is null or c.data_pedido < p_fim)
  ),
  cart as (
    select t.loja_id, t.order_sn,
      coalesce(sum(t.valor) filter (where t.tipo = 'ESCROW_VERIFIED_ADD'), 0) as renda,
      coalesce(sum(t.valor) filter (where t.tipo in ('ADJUSTMENT_FOR_RR_AFTER_ESCROW_VERIFIED','ESCROW_VERIFIED_MINUS')), 0) as ajustes,
      bool_or(t.tipo like 'FAST_ESCROW%') as acelera
    from carteira_transacoes t
    where t.order_sn is not null and (p_loja_ids is null or t.loja_id = any(p_loja_ids))
    group by t.loja_id, t.order_sn
  ),
  j as (
    select r.*, c.renda, c.ajustes, coalesce(c.acelera, false) as acelera,
           case when c.order_sn is null then 'sem_repasse' when abs(c.renda - r.repasse) <= 0.01 then 'ok'
                when abs(c.renda + c.ajustes - r.repasse) <= 0.01 then 'ok_com_ajuste' else 'diferenca' end as situacao
    from rep r left join cart c on c.loja_id = r.loja_id and c.order_sn = r.order_sn
  )
  select json_build_object(
    'total', (select count(*) from j),
    'ok', (select count(*) from j where situacao = 'ok'),
    'ok_com_ajuste', (select count(*) from j where situacao = 'ok_com_ajuste'),
    'sem_repasse', (select count(*) from j where situacao = 'sem_repasse'),
    'diferenca', (select count(*) from j where situacao = 'diferenca'),
    'exemplos', (select coalesce(json_agg(json_build_object('order_sn', order_sn, 'repasse', repasse, 'carteira', renda, 'ajustes', ajustes, 'acelera', acelera, 'data', data_pedido)), '[]'::json)
                 from (select * from j where situacao = 'diferenca' order by abs(renda - repasse) desc limit p_limite) x)
  );
$$;
grant execute on function conferencia_pedido_carteira(uuid[], timestamptz, timestamptz, int) to anon, authenticated;

-- Conferência 5 · taxa de serviço do afiliado ÷ comissão do afiliado (esperado 12% a 15%).
create or replace function conferencia_afiliado_taxa(p_loja_ids uuid[] default null, p_inicio timestamptz default null, p_fim timestamptz default null, p_limite int default 50)
returns json language sql stable as $$
  with a as (
    select c.loja_id, c.order_sn, c.data_pedido,
      -coalesce(sum(c.valor) filter (where c.categoria = 'afiliado'), 0) as comissao,
      -coalesce(sum(c.valor) filter (where c.categoria = 'serv_afiliado'), 0) as taxa
    from custos_pedido c
    where c.categoria in ('afiliado','serv_afiliado')
      and (p_loja_ids is null or c.loja_id = any(p_loja_ids))
      and (p_inicio is null or c.data_pedido >= p_inicio) and (p_fim is null or c.data_pedido < p_fim)
    group by 1,2,3 having -coalesce(sum(c.valor) filter (where c.categoria = 'afiliado'), 0) > 0
  ),
  b as (select *, case when comissao > 0 then taxa / comissao else null end as razao from a)
  select json_build_object(
    'pedidos_com_afiliado', (select count(*) from b),
    'comissao_total', (select coalesce(round(sum(comissao),2),0) from b),
    'taxa_total', (select coalesce(round(sum(taxa),2),0) from b),
    'razao_media', (select round(avg(razao)*100, 2) from b where razao is not null),
    'fora_da_faixa', (select count(*) from b where razao is null or razao < 0.12 or razao > 0.15),
    'exemplos', (select coalesce(json_agg(json_build_object('order_sn', order_sn, 'comissao', comissao, 'taxa', taxa, 'razao', round(razao*100,2), 'data', data_pedido)), '[]'::json)
                 from (select * from b where razao is null or razao < 0.12 or razao > 0.15 order by comissao desc limit p_limite) x)
  );
$$;
grant execute on function conferencia_afiliado_taxa(uuid[], timestamptz, timestamptz, int) to anon, authenticated;

-- Conferência 7 · frete pago pelo vendedor (soma das linhas de frete ≠ 0).
create or replace function conferencia_frete_vendedor(p_loja_ids uuid[] default null, p_inicio timestamptz default null, p_fim timestamptz default null, p_limite int default 50)
returns json language sql stable as $$
  with f as (
    select c.loja_id, c.order_sn, c.data_pedido, round(sum(c.valor),2) as frete
    from custos_pedido c
    where c.categoria = 'frete' and c.soma
      and (p_loja_ids is null or c.loja_id = any(p_loja_ids))
      and (p_inicio is null or c.data_pedido >= p_inicio) and (p_fim is null or c.data_pedido < p_fim)
    group by 1,2,3 having abs(sum(c.valor)) > 0.005
  )
  select json_build_object(
    'pedidos', (select count(*) from f),
    'custo_total', (select coalesce(round(-sum(frete) filter (where frete < 0),2),0) from f),
    'credito_total', (select coalesce(round(sum(frete) filter (where frete > 0),2),0) from f),
    'exemplos', (select coalesce(json_agg(json_build_object('order_sn', order_sn, 'frete', frete, 'data', data_pedido)), '[]'::json)
                 from (select * from f order by frete asc limit p_limite) x)
  );
$$;
grant execute on function conferencia_frete_vendedor(uuid[], timestamptz, timestamptz, int) to anon, authenticated;

-- Visão mensal: Camada 1 por categoria (competência = data do pedido) + Camada 2 por categoria (data da transação).
create or replace function custos_mensal(p_loja_ids uuid[] default null, p_inicio timestamptz default null, p_fim timestamptz default null)
returns json language sql stable as $$
  with ped as (
    select to_char(c.data_pedido at time zone 'America/Sao_Paulo', 'YYYY-MM') as mes, c.categoria, round(sum(c.valor),2) as valor,
           count(distinct c.order_sn) filter (where c.campo = 'repasse') as pedidos
    from custos_pedido c
    where c.soma or c.campo = 'repasse'
      and (p_loja_ids is null or c.loja_id = any(p_loja_ids))
      and (p_inicio is null or c.data_pedido >= p_inicio) and (p_fim is null or c.data_pedido < p_fim)
    group by 1,2
  ),
  cart as (
    select to_char(t.criado_em at time zone 'America/Sao_Paulo', 'YYYY-MM') as mes, t.categoria, round(sum(t.valor),2) as valor, count(*) as qtd
    from carteira_transacoes t
    where (p_loja_ids is null or t.loja_id = any(p_loja_ids))
      and (p_inicio is null or t.criado_em >= p_inicio) and (p_fim is null or t.criado_em < p_fim)
    group by 1,2
  )
  select json_build_object(
    'pedido', (select coalesce(json_agg(row_to_json(p) order by p.mes, p.categoria), '[]'::json) from ped p),
    'carteira', (select coalesce(json_agg(json_build_object('mes', c.mes, 'categoria', c.categoria, 'rotulo', rotulo_categoria_carteira(c.categoria), 'valor', c.valor, 'qtd', c.qtd) order by c.mes, c.categoria), '[]'::json) from cart c)
  );
$$;
grant execute on function custos_mensal(uuid[], timestamptz, timestamptz) to anon, authenticated;

-- Linhas de um pedido para a tela.
create or replace function custos_do_pedido(p_order_sn text)
returns table(loja_id uuid, order_sn text, campo text, rotulo text, grupo text, categoria text, valor numeric, soma boolean)
language sql stable as $$
  select c.loja_id, c.order_sn, c.campo, c.rotulo, c.grupo, c.categoria, c.valor, c.soma
  from custos_pedido c where c.order_sn = p_order_sn
  order by case c.grupo when 'produtos' then 1 when 'frete' then 2 when 'taxas' then 3 when 'afiliado' then 4 when 'outros' then 5 when 'total' then 6 else 7 end, c.campo;
$$;
grant execute on function custos_do_pedido(text) to anon, authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- DRE: novas linhas da carteira (Acelera, estornos, compensações, DIFAL, ajustes, afiliado tardio)
-- ────────────────────────────────────────────────────────────────────────────
create or replace function resumo_financas(p_loja_ids uuid[] default null, p_inicio timestamptz default null, p_fim timestamptz default null, p_conta uuid default null)
returns json language sql stable as $$
  with di as (select (p_inicio at time zone 'America/Sao_Paulo')::date as ini, (p_fim at time zone 'America/Sao_Paulo')::date as fim),
  comp as (
    select coalesce(sum(receita_bruta),0) as receita_bruta, coalesce(sum(taxas),0) as taxas,
      coalesce(sum(cupom_proprio),0) as cupom_proprio, coalesce(sum(qtd_cupom),0) as qtd_cupom,
      coalesce(sum(afiliado),0) as afiliado, coalesce(sum(qtd_afiliado),0) as qtd_afiliado,
      coalesce(sum(taxa_servico_afiliado),0) as taxa_servico_afiliado,
      coalesce(sum(receita_liquida),0) as receita_liquida, coalesce(sum(total_pedidos),0) as total_pedidos,
      coalesce(sum(a_receber),0) as a_receber, coalesce(sum(qtd_a_receber),0) as qtd_a_receber,
      coalesce(sum(frete_custo),0) as frete_custo
    from financas_resumo_diario f, di
    where (p_loja_ids is null or f.loja_id = any(p_loja_ids))
      and (p_inicio is null or f.dia >= di.ini) and (p_fim is null or f.dia < di.fim)
  ),
  cash as (
    select coalesce(sum(recebido),0) as recebido, coalesce(sum(qtd_recebido),0) as qtd_recebido
    from financas_recebido_diario r, di
    where (p_loja_ids is null or r.loja_id = any(p_loja_ids))
      and (p_inicio is null or r.dia >= di.ini) and (p_fim is null or r.dia < di.fim)
  ),
  cart as (
    select coalesce(-sum(valor) filter (where categoria='ads'),0) as ads,
           coalesce(-sum(valor) filter (where categoria='reembolso'),0) as reembolsos,
           coalesce(-sum(valor) filter (where categoria='acelera_taxa'),0) as acelera_taxa,
           coalesce(-sum(valor) filter (where categoria='estorno'),0) as estornos,
           coalesce(sum(valor) filter (where categoria='compensacao'),0) as compensacoes,
           coalesce(-sum(valor) filter (where categoria='difal'),0) as difal,
           coalesce(-sum(valor) filter (where categoria in ('logistica_volumoso','logistica_peso','logistica_full','estorno_credito','ajuste_debito')),0) as ajustes,
           coalesce(-sum(valor) filter (where categoria='afiliado_ajuste'),0) as afiliado_ajuste,
           count(*) filter (where categoria='desconhecido') as desconhecidos
    from carteira_transacoes
    where (p_loja_ids is null or loja_id = any(p_loja_ids))
      and (p_inicio is null or criado_em >= p_inicio) and (p_fim is null or criado_em < p_fim)
  ),
  imp as (
    select coalesce(sum(valor),0) as imposto from impostos
    where p_conta is not null and conta_id = p_conta
      and (p_inicio is null or (competencia||'-01')::timestamptz >= date_trunc('month', p_inicio))
      and (p_fim is null or (competencia||'-01')::timestamptz < p_fim)
  ),
  tk as (
    select coalesce(sum(t.settlement),0) as reembolsos_tiktok
    from tiktok_transacoes t join tiktok_extratos e on e.id = t.statement_id
    where t.tipo <> 'ORDER'
      and (p_loja_ids is null or t.loja_id = any(p_loja_ids))
      and (p_inicio is null or e.statement_time >= p_inicio) and (p_fim is null or e.statement_time < p_fim)
  ),
  uf as (
    select coalesce(json_agg(json_build_object('uf', u, 'pedidos', q, 'valor', v) order by v desc), '[]'::json) as j
    from (select f.uf as u, sum(f.total_pedidos)::int as q, coalesce(sum(f.receita_bruta),0) as v
          from financas_resumo_diario f, di
          where (p_loja_ids is null or f.loja_id = any(p_loja_ids))
            and (p_inicio is null or f.dia >= di.ini) and (p_fim is null or f.dia < di.fim)
          group by f.uf) t
  )
  select json_build_object(
    'receita_bruta',comp.receita_bruta,'taxas',comp.taxas,'cupom_proprio',comp.cupom_proprio,'qtd_cupom',comp.qtd_cupom,
    'afiliado',comp.afiliado,'qtd_afiliado',comp.qtd_afiliado,'taxa_servico_afiliado',comp.taxa_servico_afiliado,
    'receita_liquida',comp.receita_liquida,'total_pedidos',comp.total_pedidos,
    'recebido',cash.recebido,'qtd_recebido',cash.qtd_recebido,'a_receber',comp.a_receber,'qtd_a_receber',comp.qtd_a_receber,
    'ads',cart.ads,'reembolsos',cart.reembolsos,'imposto',imp.imposto,'por_uf',uf.j,
    'frete_custo',comp.frete_custo,'reembolsos_tiktok',tk.reembolsos_tiktok,
    'acelera_taxa',cart.acelera_taxa,'estornos',cart.estornos,'compensacoes',cart.compensacoes,'difal',cart.difal,
    'ajustes',cart.ajustes,'afiliado_ajuste',cart.afiliado_ajuste,'carteira_desconhecidos',cart.desconhecidos
  ) from comp,cash,cart,imp,uf,tk;
$$;
grant execute on function resumo_financas(uuid[], timestamptz, timestamptz, uuid) to anon, authenticated;
